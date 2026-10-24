# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: regra de repetição de um item de trabalho (ver ``plane.utils.issue_recurrence``)."""

# Python imports
from datetime import date

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Issue, IssueRecurrence
from plane.utils.issue_recurrence import first_next_date, serialize, today_sp
from plane.utils.recurrence import validate_rule


def _error(code):
    return Response({"error": code, "code": code}, status=status.HTTP_400_BAD_REQUEST)


class IssueRecurrenceEndpoint(BaseAPIView):
    def _issue(self, slug, project_id, issue_id):
        return Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        recurrence = IssueRecurrence.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).first()
        return Response({"recurrence": serialize(recurrence)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def put(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        rule, error = validate_rule(request.data)
        if error:
            return _error(error)
        end_date = None
        if request.data.get("end_date"):
            try:
                end_date = date.fromisoformat(str(request.data["end_date"]))
            except ValueError:
                return _error("INVALID_END_DATE")
        today = today_sp()
        # A série começa no prazo do original (ou no início, ou hoje).
        anchor = issue.target_date or issue.start_date or today
        if end_date and end_date < anchor:
            return _error("INVALID_END_DATE")
        full_rule = {**rule, "anchor_date": anchor, "end_date": end_date}
        next_date = first_next_date(full_rule, issue, today)
        # all_objects: uma regra apagada junto com o item (soft delete) volta a valer se o item voltar.
        recurrence = IssueRecurrence.all_objects.filter(issue=issue).first() or IssueRecurrence(
            issue=issue, project_id=project_id
        )
        recurrence.deleted_at = None
        recurrence.frequency = rule["frequency"]
        recurrence.interval = rule["interval"]
        recurrence.weekdays = rule["weekdays"]
        recurrence.anchor_date = anchor
        recurrence.end_date = end_date
        recurrence.next_date = next_date
        recurrence.save()
        return Response({"recurrence": serialize(recurrence)}, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id):
        IssueRecurrence.all_objects.filter(project_id=project_id, issue_id=issue_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


__all__ = ["IssueRecurrenceEndpoint"]
