# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests (Pespo): recurring work items — the rule API and the copies the beat task creates."""

from datetime import date, timedelta
from unittest import mock

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueChecklistItem,
    IssueLabel,
    IssueRecurrence,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.utils.issue_recurrence import create_due_occurrences

TODAY = date(2026, 10, 22)  # quinta-feira


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Recorrente", identifier="REC", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(project):
    return State.objects.create(
        name="Todo", group="unstarted", project=project, workspace=project.workspace, default=True
    )


@pytest.fixture
def source(project, state, create_user):
    issue = Issue.objects.create(
        name="Relatório semanal",
        project=project,
        workspace=project.workspace,
        state=state,
        start_date=TODAY - timedelta(days=2),
        target_date=TODAY,
        priority="high",
    )
    IssueAssignee.objects.create(issue=issue, assignee=create_user, project=project, workspace=project.workspace)
    label = Label.objects.create(name="Interno", project=project, workspace=project.workspace)
    IssueLabel.objects.create(issue=issue, label=label, project=project, workspace=project.workspace)
    IssueChecklistItem.objects.create(
        issue=issue, project=project, workspace=project.workspace, name="Levantar números", is_completed=True
    )
    module = Module.objects.create(name="Rotina", project=project, workspace=project.workspace)
    ModuleIssue.objects.create(issue=issue, module=module, project=project, workspace=project.workspace)
    return issue


def _url(workspace, project, issue):
    return reverse(
        "project-issue-recurrence", kwargs={"slug": workspace.slug, "project_id": project.id, "issue_id": issue.id}
    )


def _rule(issue, project, actor, **fields):
    data = {"frequency": "daily", "interval": 1, "weekdays": [], "anchor_date": TODAY, "next_date": TODAY}
    data.update(fields)
    recurrence = IssueRecurrence.objects.create(issue=issue, project=project, workspace=project.workspace, **data)
    IssueRecurrence.objects.filter(pk=recurrence.pk).update(created_by=actor)
    return recurrence


@pytest.mark.contract
class TestRecurrenceRuleApi:
    def test_save_read_and_delete(self, session_client, workspace, project, source):
        with mock.patch("plane.app.views.issue.recurrence.today_sp", return_value=TODAY):
            response = session_client.put(
                _url(workspace, project, source), {"frequency": "weekly", "weekdays": [0, 2]}, format="json"
            )
        assert response.status_code == status.HTTP_200_OK, response.data
        rule = response.data["recurrence"]
        assert rule["anchor_date"] == TODAY.isoformat()
        assert rule["next_date"] == "2026-10-26"  # a próxima segunda; o original cobre a quinta
        assert session_client.get(_url(workspace, project, source)).data["recurrence"]["weekdays"] == [0, 2]

        extras = session_client.get(
            reverse("project-card-extras", kwargs={"slug": workspace.slug, "project_id": project.id})
        ).data
        assert extras[str(source.id)]["recurring"] is True

        assert session_client.delete(_url(workspace, project, source)).status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(_url(workspace, project, source)).data["recurrence"] is None

    def test_past_anchor_starts_from_today(self, session_client, workspace, project, source):
        Issue.objects.filter(pk=source.pk).update(target_date=TODAY - timedelta(days=30), start_date=None)
        with mock.patch("plane.app.views.issue.recurrence.today_sp", return_value=TODAY):
            response = session_client.put(_url(workspace, project, source), {"frequency": "daily"}, format="json")
        assert response.data["recurrence"]["next_date"] == TODAY.isoformat()

    @pytest.mark.parametrize(
        "payload,code",
        [
            ({"frequency": "hourly"}, "INVALID_FREQUENCY"),
            ({"frequency": "daily", "interval": 0}, "INVALID_INTERVAL"),
            ({"frequency": "daily", "end_date": "2026-01-01"}, "INVALID_END_DATE"),
        ],
    )
    def test_invalid_rules(self, session_client, workspace, project, source, payload, code):
        response = session_client.put(_url(workspace, project, source), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST and response.data["code"] == code

    def test_guest_reads_but_cannot_save(self, workspace, project, source):
        guest = User.objects.create(email="guest-rec@plane.so", username="guest_rec")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        client = APIClient()
        client.force_authenticate(user=guest)
        assert client.get(_url(workspace, project, source)).status_code == status.HTTP_200_OK
        assert client.put(_url(workspace, project, source), {"frequency": "daily"}, format="json").status_code == 403


@pytest.mark.contract
class TestRecurringCopies:
    def test_copy_with_structure_on_the_occurrence_date(self, project, source, create_user):
        tomorrow = TODAY + timedelta(days=1)
        recurrence = _rule(source, project, create_user, next_date=tomorrow)

        assert create_due_occurrences(recurrence.id, today=tomorrow) == 1
        copy = Issue.issue_objects.exclude(pk=source.pk).get(project=project, name="Relatório semanal")
        assert copy.target_date == tomorrow and copy.start_date == tomorrow - timedelta(days=2)
        assert copy.priority == "high" and copy.created_by_id == create_user.id
        assert list(copy.assignees.values_list("id", flat=True)) == [create_user.id]
        assert list(copy.labels.values_list("name", flat=True)) == ["Interno"]
        assert ModuleIssue.objects.filter(issue=copy).count() == 1
        line = IssueChecklistItem.objects.get(issue=copy)
        assert line.name == "Levantar números" and line.is_completed is False

        recurrence.refresh_from_db()
        assert recurrence.next_date == tomorrow + timedelta(days=1)
        assert recurrence.created_count == 1 and recurrence.last_created_issue_id == copy.id
        # rodar de novo no mesmo dia não duplica
        assert create_due_occurrences(recurrence.id, today=tomorrow) == 0

    def test_catch_up_is_capped(self, project, source, create_user):
        start = TODAY - timedelta(days=20)
        recurrence = _rule(source, project, create_user, anchor_date=start, next_date=start)
        assert create_due_occurrences(recurrence.id, today=TODAY) == 10
        recurrence.refresh_from_db()
        assert recurrence.next_date == TODAY + timedelta(days=1)

    def test_series_stops_when_the_author_leaves(self, project, source, workspace):
        leaver = User.objects.create(email="leaver-rec@plane.so", username="leaver_rec")
        ProjectMember.objects.create(project=project, member=leaver, role=15, is_active=False)
        recurrence = _rule(source, project, leaver)
        assert create_due_occurrences(recurrence.id, today=TODAY) == 0
        recurrence.refresh_from_db()
        assert recurrence.next_date is None
        assert Issue.issue_objects.filter(project=project).count() == 1

    def test_beat_task_only_takes_due_rules(self, project, source, state, create_user):
        from plane.bgtasks import issue_recurrence_task

        other = Issue.objects.create(name="Futuro", project=project, workspace=project.workspace, state=state)
        _rule(source, project, create_user, next_date=TODAY)
        _rule(other, project, create_user, next_date=TODAY + timedelta(days=5))
        with (
            mock.patch.object(issue_recurrence_task, "today_sp", return_value=TODAY),
            mock.patch("plane.utils.issue_recurrence.today_sp", return_value=TODAY),
        ):
            assert issue_recurrence_task.create_recurring_issues() == 1
        assert Issue.issue_objects.filter(project=project, name="Futuro").count() == 1
