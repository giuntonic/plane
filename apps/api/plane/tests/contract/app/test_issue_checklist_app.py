# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the work item checklist (Pespo): lightweight sub-tasks in a
tree, with assignee and due date (…/issues/<id>/checklist-items/…)."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

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
            session_client, workspace, project, issue, name="Gravar", assignee=str(create_user.id), due_date="2026-11-05"
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

        response = session_client.patch(_detail_url(workspace, project, issue, b["id"]), {"parent": None}, format="json")
        assert response.data["parent"] is None

    def test_cannot_move_into_own_descendant(self, session_client, workspace, project, issue):
        a = self._create(session_client, workspace, project, issue, name="A")
        b = self._create(session_client, workspace, project, issue, name="B", parent=a["id"])
        response = session_client.patch(_detail_url(workspace, project, issue, a["id"]), {"parent": b["id"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.patch(_detail_url(workspace, project, issue, a["id"]), {"parent": a["id"]}, format="json")
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
