# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the work item checklist (Pespo): lightweight sub-tasks in a
tree, with assignee and due date (…/issues/<id>/checklist-items/…)."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.serializers.issue_checklist import IssueChecklistItemSerializer
from plane.db.models import Issue, IssueChecklistItem, Project, ProjectMember, State, User, WorkspaceMember


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Checklist Project", identifier="CHK", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)
    return Issue.objects.create(name="Checklist Issue", project=project, workspace=project.workspace, state=state)


@pytest.fixture
def guest_client(db, workspace, project):
    guest = User.objects.create(email="guest-checklist@plane.so", username="guest_checklist")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


def _list_url(workspace, project, issue):
    return reverse(
        "project-issue-checklist-items",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
    )


def _detail_url(workspace, project, issue, item_id):
    return reverse(
        "project-issue-checklist-item-detail",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id, "pk": item_id},
    )


@pytest.mark.contract
class TestIssueChecklistItems:
    def _create(self, client, workspace, project, issue, **data):
        response = client.post(_list_url(workspace, project, issue), data, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def test_create_and_list_tree(self, session_client, workspace, project, issue):
        root = self._create(session_client, workspace, project, issue, name="Briefing")
        child = self._create(session_client, workspace, project, issue, name="Roteiro", parent=root["id"])
        second = self._create(session_client, workspace, project, issue, name="Aprovação")

        assert child["parent"] == root["id"]
        assert second["sort_order"] > root["sort_order"]

        response = session_client.get(_list_url(workspace, project, issue))
        assert response.status_code == status.HTTP_200_OK
        # ordem: sort_order, depois created_at (a primeira linha de cada nível começa em 65535)
        assert [item["name"] for item in response.data] == ["Briefing", "Roteiro", "Aprovação"]
        assert {item["id"]: item["parent"] for item in response.data}[child["id"]] == root["id"]

    def test_assignee_and_due_date(self, session_client, workspace, project, issue, create_user):
        item = self._create(
            session_client,
            workspace,
            project,
            issue,
            name="Gravar",
            assignee=str(create_user.id),
            due_date="2026-11-05",
        )
        assert item["assignee"] == create_user.id
        assert item["due_date"] == "2026-11-05"

    def test_assignee_must_be_project_member(self, session_client, workspace, project, issue):
        outsider = User.objects.create(email="outsider@plane.so", username="outsider")
        response = session_client.post(
            _list_url(workspace, project, issue), {"name": "x", "assignee": str(outsider.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_complete_sets_completed_at(self, session_client, workspace, project, issue):
        item = self._create(session_client, workspace, project, issue, name="Editar")
        response = session_client.patch(
            _detail_url(workspace, project, issue, item["id"]), {"is_completed": True}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_completed"] is True
        assert response.data["completed_at"] is not None

        response = session_client.patch(
            _detail_url(workspace, project, issue, item["id"]), {"is_completed": False}, format="json"
        )
        assert response.data["completed_at"] is None

    def test_move_to_another_parent_and_back_to_root(self, session_client, workspace, project, issue):
        a = self._create(session_client, workspace, project, issue, name="A")
        b = self._create(session_client, workspace, project, issue, name="B")
        response = session_client.patch(
            _detail_url(workspace, project, issue, b["id"]), {"parent": a["id"], "sort_order": 100}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["parent"] == a["id"]
        assert response.data["sort_order"] == 100

        response = session_client.patch(
            _detail_url(workspace, project, issue, b["id"]), {"parent": None}, format="json"
        )
        assert response.data["parent"] is None

    def test_two_patches_at_once_keep_both_fields(self, session_client, workspace, project, issue):
        """Tab manda o texto e o recuo quase juntos; o PATCH do recuo, carregado antes do outro
        terminar, regravava a linha inteira e apagava o texto."""
        a = self._create(session_client, workspace, project, issue, name="A")
        b = self._create(session_client, workspace, project, issue, name="")
        stale = IssueChecklistItem.objects.get(pk=b["id"])
        session_client.patch(_detail_url(workspace, project, issue, b["id"]), {"name": "Roteiro"}, format="json")
        serializer = IssueChecklistItemSerializer(stale, data={"sort_order": 5}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(parent=IssueChecklistItem.objects.get(pk=a["id"]))
        item = IssueChecklistItem.objects.get(pk=b["id"])
        assert item.name == "Roteiro"
        assert str(item.parent_id) == str(a["id"])

    def test_cannot_move_into_own_descendant(self, session_client, workspace, project, issue):
        a = self._create(session_client, workspace, project, issue, name="A")
        b = self._create(session_client, workspace, project, issue, name="B", parent=a["id"])
        response = session_client.patch(
            _detail_url(workspace, project, issue, a["id"]), {"parent": b["id"]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.patch(
            _detail_url(workspace, project, issue, a["id"]), {"parent": a["id"]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_parent_must_belong_to_same_issue(self, session_client, workspace, project, issue):
        other = Issue.objects.create(name="Other", project=project, workspace=workspace, state=issue.state)
        foreign = self._create(session_client, workspace, project, other, name="Foreign")
        response = session_client.post(
            _list_url(workspace, project, issue), {"name": "x", "parent": foreign["id"]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_removes_sublists(self, session_client, workspace, project, issue):
        a = self._create(session_client, workspace, project, issue, name="A")
        b = self._create(session_client, workspace, project, issue, name="B", parent=a["id"])
        self._create(session_client, workspace, project, issue, name="C", parent=b["id"])
        response = session_client.delete(_detail_url(workspace, project, issue, a["id"]))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert IssueChecklistItem.all_objects.filter(issue=issue).count() == 0

    def test_guest_can_read_but_not_write(self, session_client, guest_client, workspace, project, issue):
        item = self._create(session_client, workspace, project, issue, name="A")
        assert guest_client.get(_list_url(workspace, project, issue)).status_code == status.HTTP_200_OK
        response = guest_client.post(_list_url(workspace, project, issue), {"name": "x"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        response = guest_client.patch(
            _detail_url(workspace, project, issue, item["id"]), {"is_completed": True}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


def _checklists_url(workspace, project, issue):
    return reverse(
        "project-issue-checklists",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id},
    )


def _checklist_detail_url(workspace, project, issue, checklist_id):
    return reverse(
        "project-issue-checklist-detail",
        kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id, "pk": checklist_id},
    )


@pytest.mark.contract
class TestNamedChecklists:
    """Checklists com nome ("Aprovação", "Entrega"…); linhas sem checklist são a lista padrão."""

    def _post(self, client, url, **data):
        response = client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def test_lines_belong_to_their_checklist(self, session_client, workspace, project, issue):
        approval = self._post(session_client, _checklists_url(workspace, project, issue), name="Aprovação")
        delivery = self._post(session_client, _checklists_url(workspace, project, issue), name="Entrega")
        assert delivery["sort_order"] > approval["sort_order"]

        items_url = _list_url(workspace, project, issue)
        default = self._post(session_client, items_url, name="Briefing")
        first = self._post(session_client, items_url, name="Cliente aprova", checklist=approval["id"])
        child = self._post(session_client, items_url, name="Por e-mail", parent=first["id"])
        # a sublinha herda a checklist da linha de cima, mesmo pedindo outra
        child2 = self._post(session_client, items_url, name="Por Whats", parent=first["id"], checklist=delivery["id"])

        assert default["checklist"] is None
        assert first["checklist"] == approval["id"]
        assert child["checklist"] == approval["id"] and child2["checklist"] == approval["id"]
        # a primeira linha de cada lista começa no mesmo lugar (ordem por lista)
        assert first["sort_order"] == default["sort_order"] == 65535

        listing = session_client.get(_checklists_url(workspace, project, issue))
        assert [row["name"] for row in listing.data] == ["Aprovação", "Entrega"]

    def test_moving_a_line_carries_its_sublines(self, session_client, workspace, project, issue):
        approval = self._post(session_client, _checklists_url(workspace, project, issue), name="Aprovação")
        items_url = _list_url(workspace, project, issue)
        root = self._post(session_client, items_url, name="Arte")
        child = self._post(session_client, items_url, name="Exportar", parent=root["id"])

        moved = session_client.patch(
            _detail_url(workspace, project, issue, child["id"]), {"checklist": approval["id"]}, format="json"
        )
        assert moved.status_code == status.HTTP_200_OK, moved.data
        assert moved.data["checklist"] == approval["id"] and moved.data["parent"] is None

        other = self._post(session_client, items_url, name="Outra", checklist=approval["id"])
        grandchild = self._post(session_client, items_url, name="PDF", parent=root["id"])
        session_client.patch(_detail_url(workspace, project, issue, root["id"]), {"parent": other["id"]}, format="json")
        assert IssueChecklistItem.objects.get(pk=root["id"]).checklist_id == approval["id"]
        assert IssueChecklistItem.objects.get(pk=grandchild["id"]).checklist_id == approval["id"]

        back = session_client.patch(
            _detail_url(workspace, project, issue, root["id"]), {"checklist": None}, format="json"
        )
        assert back.data["checklist"] is None and back.data["parent"] is None
        assert IssueChecklistItem.objects.get(pk=grandchild["id"]).checklist_id is None

    def test_checklist_of_another_work_item_is_refused(self, session_client, workspace, project, issue):
        other_issue = Issue.objects.create(name="Outro", project=project, workspace=project.workspace)
        foreign = self._post(session_client, _checklists_url(workspace, project, other_issue), name="Alheia")
        response = session_client.post(
            _list_url(workspace, project, issue), {"name": "x", "checklist": foreign["id"]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rename_and_delete_with_its_lines(self, session_client, workspace, project, issue):
        approval = self._post(session_client, _checklists_url(workspace, project, issue), name="Aprovação")
        items_url = _list_url(workspace, project, issue)
        keep = self._post(session_client, items_url, name="Fica")
        line = self._post(session_client, items_url, name="Sai", checklist=approval["id"])
        self._post(session_client, items_url, name="Sai junto", parent=line["id"])

        renamed = session_client.patch(
            _checklist_detail_url(workspace, project, issue, approval["id"]), {"name": "Aprovação final"}, format="json"
        )
        assert renamed.data["name"] == "Aprovação final"
        deleted = session_client.delete(_checklist_detail_url(workspace, project, issue, approval["id"]))
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert list(IssueChecklistItem.objects.filter(issue=issue).values_list("id", flat=True)) == [keep["id"]]

    def test_guest_can_read_but_not_create(self, session_client, guest_client, workspace, project, issue):
        self._post(session_client, _checklists_url(workspace, project, issue), name="Aprovação")
        assert guest_client.get(_checklists_url(workspace, project, issue)).status_code == status.HTTP_200_OK
        response = guest_client.post(_checklists_url(workspace, project, issue), {"name": "Minha"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
