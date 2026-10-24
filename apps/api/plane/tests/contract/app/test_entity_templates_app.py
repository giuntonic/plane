# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests (Pespo): templates of work items, modules, cycles, pages and projects."""

from datetime import date, datetime, timezone

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Cycle,
    CycleIssue,
    EntityTemplate,
    Issue,
    IssueChecklistItem,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Page,
    Project,
    ProjectMember,
    ProjectPage,
    State,
    User,
    WorkspaceMember,
)


def _project(workspace, user, name, identifier):
    project = Project.objects.create(name=name, identifier=identifier, workspace=workspace, created_by=user)
    ProjectMember.objects.create(project=project, member=user, role=20, is_active=True)
    State.objects.create(name="Backlog", group="backlog", project=project, workspace=workspace, sequence=1)
    State.objects.create(name="Todo", group="unstarted", project=project, workspace=workspace, sequence=2, default=True)
    State.objects.create(name="Done", group="completed", project=project, workspace=workspace, sequence=3)
    return project


@pytest.fixture
def project(db, workspace, create_user):
    WorkspaceMember.objects.get_or_create(workspace=workspace, member=create_user, defaults={"role": 20})
    return _project(workspace, create_user, "Origem", "ORI")


@pytest.fixture
def other_project(db, workspace, create_user):
    return _project(workspace, create_user, "Destino", "DST")


def _issue(project, name, **extra):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, **extra)


def _templates_url(workspace):
    return reverse("workspace-templates", kwargs={"slug": workspace.slug})


def _detail_url(workspace, template_id):
    return reverse("workspace-template-detail", kwargs={"slug": workspace.slug, "pk": template_id})


def _apply_url(workspace, template_id):
    return reverse("workspace-template-apply", kwargs={"slug": workspace.slug, "pk": template_id})


def _save(client, workspace, **data):
    response = client.post(_templates_url(workspace), data, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.data


@pytest.mark.contract
class TestWorkItemTemplates:
    @pytest.fixture
    def source(self, project):
        label = Label.objects.create(name="Reels", color="#4285F4", project=project, workspace=project.workspace)
        source = _issue(project, "Peça padrão", priority="high", start_date=date(2026, 11, 2))
        IssueLabel.objects.create(issue=source, label=label, project=project, workspace=project.workspace)
        line = IssueChecklistItem.objects.create(
            issue=source, project=project, workspace=project.workspace, name="Briefing", due_date=date(2026, 11, 4)
        )
        IssueChecklistItem.objects.create(
            issue=source, project=project, workspace=project.workspace, name="Referências", parent=line
        )
        _issue(project, "Roteiro", parent=source, target_date=date(2026, 11, 9))
        return source

    def test_save_list_prefill_and_apply(self, session_client, workspace, project, other_project, source):
        template = _save(session_client, workspace, kind="work_item", source_id=str(source.id), project_only=False)
        assert template["name"] == "Peça padrão"
        assert template["project"] is None
        assert template["summary"] == {"work_items": 4}  # item + 2 subtarefas + 1 sub-item

        listed = session_client.get(_templates_url(workspace), {"kind": "work_item", "project_id": other_project.id})
        assert [t["id"] for t in listed.data] == [template["id"]]

        # A etiqueta é achada pelo nome no outro projeto.
        Label.objects.create(name="reels", project=other_project, workspace=workspace)
        detail = session_client.get(_detail_url(workspace, template["id"]), {"project_id": other_project.id})
        assert detail.status_code == status.HTTP_200_OK
        prefill = detail.data["prefill"]
        assert prefill["name"] == "Peça padrão" and prefill["priority"] == "high"
        assert prefill["label_ids"] == [str(Label.objects.get(project=other_project).id)]

        new_issue = _issue(other_project, "Peça nova", start_date=date(2026, 12, 7))
        response = session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(other_project.id), "issue_id": str(new_issue.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        lines = {line.name: line for line in IssueChecklistItem.objects.filter(issue=new_issue)}
        assert lines["Referências"].parent_id == lines["Briefing"].id
        assert lines["Briefing"].due_date == date(2026, 12, 9)  # +35 dias, como o item
        child = Issue.issue_objects.get(parent=new_issue)
        assert child.name == "Roteiro" and child.project_id == other_project.id
        assert child.target_date == date(2026, 12, 14)

    def test_without_anchor_dates_are_dropped(self, session_client, workspace, project, source):
        template = _save(session_client, workspace, kind="work_item", source_id=str(source.id))
        new_issue = _issue(project, "Sem data")
        session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(project.id), "issue_id": str(new_issue.id)},
            format="json",
        )
        assert Issue.issue_objects.get(parent=new_issue).target_date is None
        assert IssueChecklistItem.objects.get(issue=new_issue, name="Briefing").due_date is None

    def test_project_only_template_stays_in_its_project(
        self, session_client, workspace, project, other_project, source
    ):
        template = _save(session_client, workspace, kind="work_item", source_id=str(source.id))
        assert template["project"] == project.id

        listed = session_client.get(_templates_url(workspace), {"kind": "work_item", "project_id": other_project.id})
        assert listed.data == []
        new_issue = _issue(other_project, "Outro")
        response = session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(other_project.id), "issue_id": str(new_issue.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_project_template_hidden_from_non_members(self, workspace, project, source, session_client):
        template = _save(session_client, workspace, kind="work_item", source_id=str(source.id))
        outsider = User.objects.create(email="outsider-tpl@plane.so", username="outsider_tpl")
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=15)
        client = APIClient()
        client.force_authenticate(user=outsider)

        assert client.get(_templates_url(workspace)).data == []
        assert client.get(_detail_url(workspace, template["id"])).status_code == status.HTTP_404_NOT_FOUND

    def test_only_author_or_admin_can_delete(self, workspace, project, source, session_client):
        template = _save(session_client, workspace, kind="work_item", source_id=str(source.id), project_only=False)
        member = User.objects.create(email="member-tpl@plane.so", username="member_tpl")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        client = APIClient()
        client.force_authenticate(user=member)

        assert client.delete(_detail_url(workspace, template["id"])).status_code == status.HTTP_403_FORBIDDEN
        assert session_client.delete(_detail_url(workspace, template["id"])).status_code == 204
        assert not EntityTemplate.objects.filter(pk=template["id"]).exists()

    def test_guest_cannot_list(self, workspace, project):
        guest = User.objects.create(email="guest-tpl@plane.so", username="guest_tpl")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        client = APIClient()
        client.force_authenticate(user=guest)
        assert client.get(_templates_url(workspace)).status_code == status.HTTP_403_FORBIDDEN

    def test_too_large(self, session_client, workspace, project, monkeypatch):
        monkeypatch.setattr("plane.utils.work_item_tree.MAX_TREE_NODES", 2)
        big = _issue(project, "Grande")
        for index in range(3):
            IssueChecklistItem.objects.create(
                issue=big, project=project, workspace=project.workspace, name=f"linha {index}"
            )
        response = session_client.post(
            _templates_url(workspace), {"kind": "work_item", "source_id": str(big.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "TEMPLATE_TOO_LARGE"


@pytest.mark.contract
class TestModuleAndCycleTemplates:
    def test_module_items_follow_the_new_start_date(self, session_client, workspace, project):
        module = Module.objects.create(
            name="Lançamento",
            project=project,
            workspace=workspace,
            start_date=date(2026, 11, 2),
            target_date=date(2026, 11, 30),
        )
        first = _issue(project, "Teaser", target_date=date(2026, 11, 5))
        child = _issue(project, "Legenda", parent=first)
        second = _issue(project, "Post final")
        for issue in (first, child, second):
            ModuleIssue.objects.create(module=module, issue=issue, project=project, workspace=workspace)

        template = _save(session_client, workspace, kind="module", source_id=str(module.id))
        assert template["summary"] == {"work_items": 3}
        prefill = session_client.get(_detail_url(workspace, template["id"]), {"project_id": project.id}).data["prefill"]
        assert prefill == {"name": "Lançamento", "description": "", "duration_days": 28}

        new_module = Module.objects.create(
            name="Lançamento 2", project=project, workspace=workspace, start_date=date(2027, 1, 4)
        )
        response = session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(project.id), "module_id": str(new_module.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        created = Issue.issue_objects.filter(issue_module__module=new_module, issue_module__deleted_at__isnull=True)
        assert sorted(created.values_list("name", flat=True)) == ["Legenda", "Post final", "Teaser"]
        teaser = created.get(name="Teaser")
        assert teaser.target_date == date(2027, 1, 7)
        assert created.get(name="Legenda").parent_id == teaser.id

    def test_cycle_template(self, session_client, workspace, project, create_user):
        cycle = Cycle.objects.create(
            name="Sprint",
            project=project,
            workspace=workspace,
            owned_by=create_user,
            start_date=datetime(2026, 11, 2, tzinfo=timezone.utc),
            end_date=datetime(2026, 11, 13, tzinfo=timezone.utc),
        )
        item = _issue(project, "Planejamento", target_date=date(2026, 11, 3))
        CycleIssue.objects.create(cycle=cycle, issue=item, project=project, workspace=workspace)
        template = _save(session_client, workspace, kind="cycle", source_id=str(cycle.id))

        new_cycle = Cycle.objects.create(
            name="Sprint 2",
            project=project,
            workspace=workspace,
            owned_by=create_user,
            start_date=datetime(2026, 11, 16, tzinfo=timezone.utc),
        )
        response = session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(project.id), "cycle_id": str(new_cycle.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        created = Issue.issue_objects.get(issue_cycle__cycle=new_cycle)
        assert created.name == "Planejamento" and created.target_date == date(2026, 11, 17)


@pytest.mark.contract
class TestPageTemplates:
    def test_page_from_template(self, session_client, workspace, project, create_user):
        page = Page.objects.create(
            workspace=workspace, name="Ata de reunião", description_html="<h2>Pauta</h2><p>…</p>", owned_by=create_user
        )
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)
        template = _save(session_client, workspace, kind="page", source_id=str(page.id))

        response = session_client.post(
            _apply_url(workspace, template["id"]), {"project_id": str(project.id), "name": "Ata 23/10"}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        created = Page.objects.get(pk=response.data["page_id"])
        assert created.name == "Ata 23/10"
        assert "<h2>Pauta</h2>" in created.description_html
        assert ProjectPage.objects.filter(page=created, project=project).exists()

    def test_private_page_of_someone_else(self, session_client, workspace, project):
        owner = User.objects.create(email="owner-page@plane.so", username="owner_page")
        page = Page.objects.create(workspace=workspace, name="Privada", owned_by=owner, access=Page.PRIVATE_ACCESS)
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)
        response = session_client.post(
            _templates_url(workspace), {"kind": "page", "source_id": str(page.id)}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.contract
class TestProjectTemplates:
    @pytest.fixture
    def source(self, project):
        project.module_view = True
        project.cycle_view = True
        project.save()
        State.objects.filter(project=project).delete()
        State.objects.create(
            name="Fila de Criacao",
            group="unstarted",
            project=project,
            workspace=project.workspace,
            default=True,
            sequence=1,
        )
        State.objects.create(
            name="Em Criacao", group="started", project=project, workspace=project.workspace, sequence=2
        )
        State.objects.create(
            name="Entregue (Peca)", group="completed", project=project, workspace=project.workspace, sequence=3
        )
        parent = Label.objects.create(name="Categoria", project=project, workspace=project.workspace)
        Label.objects.create(name="Post", parent=parent, project=project, workspace=project.workspace)
        module = Module.objects.create(name="Onboarding", project=project, workspace=project.workspace)
        step = _issue(project, "1. Reunião de boas-vindas")
        ModuleIssue.objects.create(module=module, issue=step, project=project, workspace=project.workspace)
        _issue(project, "Solto")
        return project

    def test_apply_to_a_new_project(self, session_client, workspace, source, other_project):
        template = _save(session_client, workspace, kind="project", source_id=str(source.id))
        assert template["project"] is None
        assert template["summary"] == {"work_items": 2, "states": 3, "labels": 2, "modules": 1}

        response = session_client.post(
            _apply_url(workspace, template["id"]), {"project_id": str(other_project.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

        other_project.refresh_from_db()
        assert other_project.module_view and other_project.cycle_view
        states = State.objects.filter(project=other_project)
        # Projeto ainda vazio: os estados que ele ganhou ao nascer e o modelo não tem saem (o "Todo",
        # padrão até então, sai depois que o padrão do modelo assume).
        assert set(states.values_list("name", flat=True)) == {"Fila de Criacao", "Em Criacao", "Entregue (Peca)"}
        assert states.get(default=True).name == "Fila de Criacao"
        post = Label.objects.get(project=other_project, name="Post")
        assert post.parent.name == "Categoria"
        module = Module.objects.get(project=other_project, name="Onboarding")
        assert Issue.issue_objects.filter(issue_module__module=module, name="1. Reunião de boas-vindas").exists()
        assert Issue.issue_objects.filter(project=other_project, name="Solto").exists()

    def test_structure_only(self, session_client, workspace, source, other_project):
        template = _save(session_client, workspace, kind="project", source_id=str(source.id), include_work_items=False)
        assert template["summary"]["work_items"] == 0
        session_client.post(_apply_url(workspace, template["id"]), {"project_id": str(other_project.id)}, format="json")
        assert Module.objects.filter(project=other_project, name="Onboarding").exists()
        assert not Issue.issue_objects.filter(project=other_project).exists()
