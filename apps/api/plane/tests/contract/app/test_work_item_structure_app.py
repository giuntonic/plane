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
    FileAsset,
    Issue,
    IssueAssignee,
    IssueChecklist,
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

    def test_copied_lines_start_without_state(self, session_client, workspace, project, states, source):
        _line(source, "Com estado", state=states["doing"])
        copy = _issue(project, states["todo"], "Cópia")
        response = session_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert IssueChecklistItem.objects.get(issue=copy, name="Com estado").state_id is None

    def test_copy_brings_named_checklists(self, session_client, workspace, project, states, source):
        approval = IssueChecklist.objects.create(issue=source, project=project, workspace=workspace, name="Aprovação")
        line = _line(source, "Cliente aprova", checklist=approval, is_completed=True)
        _line(source, "Por e-mail", parent=line, checklist=approval)
        copy = _issue(project, states["todo"], "Cópia")

        response = session_client.post(
            _copy_url(workspace, project, copy), {"source_issue_id": str(source.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        copied = IssueChecklist.objects.get(issue=copy)
        assert copied.name == "Aprovação"
        lines = {row.name: row for row in IssueChecklistItem.objects.filter(issue=copy, checklist=copied)}
        assert set(lines) == {"Cliente aprova", "Por e-mail"}
        assert lines["Por e-mail"].parent_id == lines["Cliente aprova"].id
        assert lines["Cliente aprova"].is_completed is False  # subtarefas copiadas voltam desmarcadas
        # a lista padrão continua sem checklist
        assert not IssueChecklistItem.objects.filter(issue=copy, checklist__isnull=True, name="Cliente aprova").exists()

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

    def test_line_state_goes_to_the_new_item(self, session_client, workspace, project, states):
        issue = _issue(project, states["todo"], "Peça")
        line = _line(issue, "Em andamento", state=states["doing"])
        response = session_client.post(_convert_url(workspace, project, issue, line), {}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Issue.issue_objects.get(pk=response.data["id"]).state_id == states["doing"].id

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

    def test_state_goes_to_the_line_in_the_same_project(self, session_client, workspace, project, states):
        target = _issue(project, states["todo"], "Destino")
        issue = _issue(project, states["doing"], "Em produção")
        sub = _line(issue, "Rascunho", state=states["done"], is_completed=True)
        response = session_client.post(
            _to_checklist_url(workspace, project, issue), {"target_issue_id": str(target.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        line = IssueChecklistItem.objects.get(pk=response.data["checklist_item_id"])
        assert line.state_id == states["doing"].id and line.is_completed is False
        sub.refresh_from_db()
        assert sub.state_id == states["done"].id

    def test_states_are_dropped_in_another_project(self, session_client, workspace, project, states, create_user):
        other = Project.objects.create(name="Outro", identifier="OUT2", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, role=20, is_active=True)
        other_todo = State.objects.create(name="Todo", group="unstarted", project=other, workspace=workspace)
        target = _issue(other, other_todo, "Destino em outro projeto")
        issue = _issue(project, states["doing"], "Em produção")
        sub = _line(issue, "Rascunho", state=states["doing"])
        response = session_client.post(
            _to_checklist_url(workspace, project, issue), {"target_issue_id": str(target.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        line = IssueChecklistItem.objects.get(pk=response.data["checklist_item_id"])
        assert line.state_id is None
        sub.refresh_from_db()
        assert sub.issue_id == target.id and sub.state_id is None

    def test_named_checklists_become_sublines_too(self, session_client, workspace, project, states):
        target = _issue(project, states["todo"], "Destino")
        issue = _issue(project, states["todo"], "Com listas")
        approval = IssueChecklist.objects.create(issue=issue, project=project, workspace=workspace, name="Aprovação")
        named_line = _line(issue, "Cliente aprova", checklist=approval)
        default_line = _line(issue, "Rascunho")

        response = session_client.post(
            _to_checklist_url(workspace, project, issue), {"target_issue_id": str(target.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        line_id = response.data["checklist_item_id"]
        for moved in (named_line, default_line):
            moved.refresh_from_db()
            assert moved.issue_id == target.id and moved.parent_id is not None and moved.checklist_id is None
            assert str(moved.parent_id) == line_id
        assert not IssueChecklist.objects.filter(pk=approval.id).exists()

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


def _attachment(issue, name="arte.png", mime="image/png", uploaded=True):
    return FileAsset.objects.create(
        asset=f"{issue.workspace_id}/{name}",
        attributes={"name": name, "type": mime, "size": 10},
        issue=issue,
        project=issue.project,
        workspace=issue.workspace,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        entity_identifier=str(issue.id),
        is_uploaded=uploaded,
    )


def _extras_url(workspace, project):
    return reverse("project-card-extras", kwargs={"slug": workspace.slug, "project_id": project.id})


def _cover_url(workspace, project, issue):
    return reverse(
        "project-issue-cover", kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id}
    )


@pytest.mark.contract
class TestCardExtras:
    def test_checklist_progress_per_work_item(self, session_client, workspace, project, states):
        first = _issue(project, states["todo"], "Com subtarefas")
        _line(first, "a", is_completed=True)
        parent = _line(first, "b")
        _line(first, "b.1", parent=parent, is_completed=True)
        _issue(project, states["todo"], "Sem subtarefas")
        archived = _issue(project, states["done"], "Arquivado", archived_at=date(2026, 10, 1))
        _line(archived, "x")

        response = session_client.get(_extras_url(workspace, project))
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {str(first.id): {"checklist": {"done": 2, "total": 3}}}

    def test_cover_set_change_and_remove(self, session_client, workspace, project, states):
        issue = _issue(project, states["todo"], "Peça")
        first = _attachment(issue, "a.png")
        second = _attachment(issue, "b.jpg", mime="image/jpeg")
        pdf = _attachment(issue, "briefing.pdf", mime="application/pdf")

        assert (
            session_client.post(_cover_url(workspace, project, issue), {"attachment_id": str(first.id)}).status_code
            == 200
        )
        response = session_client.post(
            _cover_url(workspace, project, issue), {"attachment_id": str(second.id)}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        first.refresh_from_db()
        second.refresh_from_db()
        assert "pespo_cover" not in first.attributes and second.attributes["pespo_cover"] is True
        assert second.attributes["name"] == "b.jpg"  # os outros atributos continuam
        extras = session_client.get(_extras_url(workspace, project)).data
        assert extras[str(issue.id)]["cover"].endswith(f"/issues/{issue.id}/attachments/{second.id}/")

        refused = session_client.post(
            _cover_url(workspace, project, issue), {"attachment_id": str(pdf.id)}, format="json"
        )
        assert refused.status_code == status.HTTP_400_BAD_REQUEST and refused.data["code"] == "INVALID_COVER"

        removed = session_client.post(_cover_url(workspace, project, issue), {"attachment_id": None}, format="json")
        assert removed.data["cover"] is None
        assert str(issue.id) not in session_client.get(_extras_url(workspace, project)).data

    def test_attachment_of_another_work_item_is_refused(self, session_client, workspace, project, states):
        issue = _issue(project, states["todo"], "A")
        other = _issue(project, states["todo"], "B")
        image = _attachment(other)
        response = session_client.post(
            _cover_url(workspace, project, issue), {"attachment_id": str(image.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_first_image_becomes_the_cover(self, project, states):
        from plane.utils.issue_cover import cover_on_first_image

        issue = _issue(project, states["todo"], "Peça")
        pdf = _attachment(issue, "briefing.pdf", mime="application/pdf")
        cover_on_first_image(pdf)
        first = _attachment(issue, "a.png")
        cover_on_first_image(first)
        second = _attachment(issue, "b.png")
        cover_on_first_image(second)
        for asset in (pdf, first, second):
            asset.refresh_from_db()
        assert first.attributes.get("pespo_cover") is True
        assert "pespo_cover" not in pdf.attributes and "pespo_cover" not in second.attributes
