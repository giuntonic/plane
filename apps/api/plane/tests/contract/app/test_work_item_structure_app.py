# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests (Pespo): copying a work item brings its checklist, links and sub-work-items, a
checklist line can become a work item, and a work item can become a checklist line of another one."""

from datetime import date

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueChecklistItem,
    IssueLabel,
    IssueLink,
    Label,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Copy Project", identifier="CPY", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def states(db, project):
    todo = State.objects.create(
        name="Todo", group="unstarted", project=project, workspace=project.workspace, default=True, sequence=1
    )
    doing = State.objects.create(
        name="Doing", group="started", project=project, workspace=project.workspace, sequence=2
    )
    done = State.objects.create(
        name="Done", group="completed", project=project, workspace=project.workspace, sequence=3
    )
    return {"todo": todo, "doing": doing, "done": done}


def _issue(project, state, name, **extra):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state, **extra)


def _line(issue, name, parent=None, **extra):
    return IssueChecklistItem.objects.create(
        issue=issue, project=issue.project, workspace=issue.workspace, name=name, parent=parent, **extra
    )


def _copy_url(workspace, project, issue):
    return reverse(
        "project-issue-copy-structure",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
    )


def _convert_url(workspace, project, issue, line):
    return reverse(
        "project-issue-checklist-item-convert",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id, "pk": line.id},
    )


@pytest.mark.contract
class TestCopyStructure:
    @pytest.fixture
    def source(self, project, states, create_user):
        source = _issue(
            project, states["doing"], "Campanha", start_date=date(2026, 11, 2), target_date=date(2026, 11, 20)
        )
        root = _line(source, "Briefing", is_completed=True, due_date=date(2026, 11, 3), assignee=create_user)
        _line(source, "Roteiro", parent=root)
        _line(source, "Aprovação")
        IssueLink.objects.create(issue=source, project=project, title="Drive", url="https://example.com/pasta")

        label = Label.objects.create(name="Reels", project=project, workspace=project.workspace)
        child = _issue(project, states["done"], "Vídeo", parent=source, target_date=date(2026, 11, 10))
        IssueLabel.objects.create(issue=child, label=label, project=project, workspace=project.workspace)
        IssueAssignee.objects.create(issue=child, assignee=create_user, project=project, workspace=project.workspace)
        _line(child, "Gravar")
        _issue(project, states["todo"], "Corte", parent=child)
        return source

    def test_copy_brings_checklist_links_and_sub_items(self, session_client, workspace, project, states, source):
        copy = _issue(project, states["todo"], "Campanha (cópia)", start_date=date(2026, 12, 7))

        response = session_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data == {"sub_work_items": 1, "checklist_items": 3}

        lines = {line.name: line for line in IssueChecklistItem.objects.filter(issue=copy)}
        assert set(lines) == {"Briefing", "Roteiro", "Aprovação"}
        assert lines["Roteiro"].parent_id == lines["Briefing"].id
        assert lines["Briefing"].sort_order < lines["Aprovação"].sort_order
        # Começa do zero: desmarcada, mas com responsável e prazo andando junto com o item (+35 dias).
        assert lines["Briefing"].is_completed is False
        assert lines["Briefing"].due_date == date(2026, 12, 8)
        assert IssueLink.objects.filter(issue=copy, url="https://example.com/pasta").exists()

        child = Issue.issue_objects.get(parent=copy)
        assert child.name == "Vídeo"
        assert child.state_id == states["todo"].id  # estado padrão, não "Done"
        assert child.target_date == date(2026, 12, 15)
        assert list(child.labels.values_list("name", flat=True)) == ["Reels"]
        assert IssueAssignee.objects.filter(issue=child).count() == 1
        assert IssueChecklistItem.objects.filter(issue=child, name="Gravar").exists()
        assert Issue.issue_objects.filter(parent=child, name="Corte").exists()
        # O original não muda.
        assert IssueChecklistItem.objects.filter(issue=source).count() == 3
        assert Issue.issue_objects.filter(parent=source).count() == 1

    def test_copy_without_dates_keeps_the_original_dates(self, session_client, workspace, project, states, source):
        copy = _issue(project, states["todo"], "Sem datas")
        response = session_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert Issue.issue_objects.get(parent=copy).target_date == date(2026, 11, 10)

    def test_source_from_a_project_the_user_is_not_in(self, session_client, workspace, project, states, create_user):
        other = Project.objects.create(name="Outro", identifier="OUT", workspace=workspace, created_by=create_user)
        other_state = State.objects.create(name="Todo", group="unstarted", project=other, workspace=workspace)
        hidden = _issue(other, other_state, "Secreto")
        _line(hidden, "não pode vazar")
        copy = _issue(project, states["todo"], "Cópia")

        response = session_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(hidden.id)}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not IssueChecklistItem.objects.filter(issue=copy).exists()

    def test_guest_cannot_copy(self, api_client, workspace, project, states, source):
        guest = User.objects.create(email="guest-copy@plane.so", username="guest_copy")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        api_client.force_authenticate(user=guest)
        copy = _issue(project, states["todo"], "Cópia")

        response = api_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_assignee_who_left_the_project_is_dropped(self, session_client, workspace, project, states, source):
        leaver = User.objects.create(email="leaver@plane.so", username="leaver")
        ProjectMember.objects.create(project=project, member=leaver, role=15, is_active=False)
        line = IssueChecklistItem.objects.get(issue=source, name="Aprovação")
        line.assignee = leaver
        line.save()
        copy = _issue(project, states["todo"], "Cópia")

        session_client.post(_copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json")
        assert IssueChecklistItem.objects.get(issue=copy, name="Aprovação").assignee_id is None


@pytest.mark.contract
class TestConvertChecklistItem:
    def test_line_becomes_sub_item_with_its_sublist(self, session_client, workspace, project, states, create_user):
        issue = _issue(project, states["todo"], "Peça")
        line = _line(issue, "Arte final", assignee=create_user, due_date=date(2026, 11, 30))
        sub = _line(issue, "Exportar PDF", parent=line, is_completed=True)
        grandchild = _line(issue, "Conferir sangria", parent=sub)
        keep = _line(issue, "Outra linha")

        response = session_client.post(_convert_url(workspace, project, issue, line), {}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data

        new_issue = Issue.issue_objects.get(pk=response.data["id"])
        assert new_issue.parent_id == issue.id
        assert new_issue.name == "Arte final"
        assert new_issue.target_date == date(2026, 11, 30)
        assert new_issue.state_id == states["todo"].id
        assert list(new_issue.assignees.values_list("id", flat=True)) == [create_user.id]

        # As sublinhas mudaram de item com o que já estava marcado; a linha convertida saiu.
        sub.refresh_from_db()
        grandchild.refresh_from_db()
        assert sub.issue_id == new_issue.id and sub.parent_id is None and sub.is_completed is True
        assert grandchild.issue_id == new_issue.id and grandchild.parent_id == sub.id
        assert list(IssueChecklistItem.objects.filter(issue=issue).values_list("id", flat=True)) == [keep.id]

    def test_completed_line_becomes_a_completed_standalone_item(self, session_client, workspace, project, states):
        issue = _issue(project, states["todo"], "Peça")
        line = _line(issue, "Já feito", is_completed=True)

        response = session_client.post(
            _convert_url(workspace, project, issue, line), {"as_sub_item": False}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        new_issue = Issue.issue_objects.get(pk=response.data["id"])
        assert new_issue.parent_id is None
        assert new_issue.state_id == states["done"].id

    def test_line_of_another_work_item_is_not_found(self, session_client, workspace, project, states):
        issue = _issue(project, states["todo"], "A")
        other = _issue(project, states["todo"], "B")
        line = _line(other, "de B")
        response = session_client.post(_convert_url(workspace, project, issue, line), {}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert IssueChecklistItem.objects.filter(pk=line.id).exists()


def _to_checklist_url(workspace, project, issue):
    return reverse(
        "project-issue-convert-to-checklist",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
    )


@pytest.mark.contract
class TestConvertToChecklist:
    def test_sub_item_becomes_a_line_of_its_parent(self, session_client, workspace, project, states, create_user):
        parent = _issue(project, states["todo"], "Campanha")
        first = _line(parent, "Briefing", sort_order=1000)
        child = _issue(project, states["done"], "Arte do post", parent=parent, target_date=date(2026, 12, 5))
        IssueAssignee.objects.create(issue=child, assignee=create_user, project=project, workspace=workspace)
        sub = _line(child, "Rascunho", is_completed=True)
        grandchild = _line(child, "Revisar texto", parent=sub)

        response = session_client.post(
            _to_checklist_url(workspace, project, child), {"target_issue_id": str(parent.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data

        line = IssueChecklistItem.objects.get(pk=response.data["checklist_item_id"])
        assert line.issue_id == parent.id and line.parent_id is None
        assert line.name == "Arte do post" and line.due_date == date(2026, 12, 5)
        assert line.assignee_id == create_user.id and line.is_completed is True and line.completed_at
        assert line.sort_order > first.sort_order  # entra no fim da lista
        sub.refresh_from_db()
        grandchild.refresh_from_db()
        assert sub.issue_id == parent.id and sub.parent_id == line.id and sub.is_completed is True
        assert grandchild.issue_id == parent.id and grandchild.parent_id == sub.id
        # O item sai como numa exclusão normal (soft delete).
        assert not Issue.issue_objects.filter(pk=child.id).exists()
        assert Issue.all_objects.get(pk=child.id).deleted_at is not None

    def test_work_item_with_sub_items_is_refused(self, session_client, workspace, project, states):
        target = _issue(project, states["todo"], "Destino")
        issue = _issue(project, states["todo"], "Com filhos")
        _issue(project, states["todo"], "Filho", parent=issue)
        response = session_client.post(
            _to_checklist_url(workspace, project, issue), {"target_issue_id": str(target.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "HAS_SUB_WORK_ITEMS"
        assert Issue.issue_objects.filter(pk=issue.id).exists()

    def test_only_admin_or_creator(self, api_client, workspace, project, states, create_user):
        member = User.objects.create(email="member-conv@plane.so", username="member_conv")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        ProjectMember.objects.create(project=project, member=member, role=15, is_active=True)
        api_client.force_authenticate(user=member)
        target = _issue(project, states["todo"], "Destino")
        others = _issue(project, states["todo"], "Criado por outra pessoa")
        mine = _issue(project, states["todo"], "Criado por mim")
        # O save do BaseModel preenche created_by pelo usuário da requisição; aqui vai direto no banco.
        Issue.objects.filter(pk=others.pk).update(created_by=create_user)
        Issue.objects.filter(pk=mine.pk).update(created_by=member)

        refused = api_client.post(
            _to_checklist_url(workspace, project, others), {"target_issue_id": str(target.id)}, format="json"
        )
        allowed = api_client.post(
            _to_checklist_url(workspace, project, mine), {"target_issue_id": str(target.id)}, format="json"
        )
        assert refused.status_code == status.HTTP_403_FORBIDDEN
        assert allowed.status_code == status.HTTP_201_CREATED, allowed.data

    def test_target_must_be_in_a_project_of_the_user(self, session_client, workspace, project, states, create_user):
        hidden = Project.objects.create(name="Fechado", identifier="FEC", workspace=workspace, created_by=create_user)
        hidden_state = State.objects.create(name="Todo", group="unstarted", project=hidden, workspace=workspace)
        foreign = _issue(hidden, hidden_state, "De outro projeto")
        issue = _issue(project, states["todo"], "Item")
        for target in (foreign, issue):
            response = session_client.post(
                _to_checklist_url(workspace, project, issue), {"target_issue_id": str(target.id)}, format="json"
            )
            assert response.status_code == status.HTTP_404_NOT_FOUND
        assert Issue.issue_objects.filter(pk=issue.id).exists()


@pytest.mark.contract
class TestChecklistProgress:
    def test_counts_per_work_item(self, session_client, workspace, project, states):
        first = _issue(project, states["todo"], "Com subtarefas")
        _line(first, "a", is_completed=True)
        parent = _line(first, "b")
        _line(first, "b.1", parent=parent, is_completed=True)
        _issue(project, states["todo"], "Sem subtarefas")
        archived = _issue(project, states["done"], "Arquivado", archived_at=date(2026, 10, 1))
        _line(archived, "x")

        response = session_client.get(
            reverse("project-checklist-progress", kwargs={"slug": workspace.slug, "project_id": project.id})
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {str(first.id): {"done": 2, "total": 3}}
