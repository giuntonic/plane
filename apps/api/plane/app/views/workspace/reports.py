# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: relatórios do espaço de trabalho (página "Relatórios", junto com as horas).

- ``…/projects/<id>/monthly-report/?month=AAAA-MM``: o mês de um cliente (cada cliente é um projeto): peças
  pedidas e entregues, prazos, refações, horas, reuniões e atas, e o saldo do contrato (do portal).
- ``…/workload/``: a carga da equipe agora: itens abertos por pessoa, atrasados, vencendo nos próximos 7 dias,
  subtarefas abertas e horas lançadas na semana.

Só a equipe (admin e membro) abre. As regras de peça e de refação são as do painel de peças
(``plane.utils.pieces``), para os números baterem."""

# Python imports
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Django imports
from django.db.models import Q
from django.utils import timezone

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueCalendarEvent,
    IssueChecklistItem,
    IssueTimeEntry,
    MeetingRecording,
    Project,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.utils.pieces import CATEGORIES, _is_rework_state, availability, load_project_issues
from plane.utils.portal_contracts import PortalUnavailable, get_project_contract
from plane.utils.time_tracking import entry_seconds

OPEN_GROUPS = ("backlog", "unstarted", "started")


def _zone(workspace):
    try:
        return ZoneInfo(workspace.timezone or "America/Sao_Paulo")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("America/Sao_Paulo")


def _month_bounds(value, zone):
    today = timezone.now().astimezone(zone).date()
    try:
        year, month = (int(part) for part in (value or "").split("-"))
        first = date(year, month, 1)
    except (TypeError, ValueError):
        first = today.replace(day=1)
    following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    return (
        first,
        following,
        datetime.combine(first, time.min, tzinfo=zone),
        datetime.combine(following, time.min, tzinfo=zone),
    )


def _person(user):
    return {"id": str(user.id), "display_name": user.display_name or user.first_name or user.email}


class ProjectMonthlyReportEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.select_related("workspace").filter(workspace__slug=slug, pk=project_id).first()
        if not project:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        zone = _zone(project.workspace)
        first, following, start, end = _month_bounds(request.GET.get("month"), zone)
        in_month = lambda value: value is not None and start <= value < end  # noqa: E731

        # Peças: pedidas e entregues no mês, e o que está aberto agora
        issues = load_project_issues(project)
        sequences = dict(Issue.issue_objects.filter(project=project).values_list("id", "sequence_id"))
        pieces = [issue for issue in issues if issue["category"]]
        delivered = []
        for issue in sorted(
            (i for i in pieces if in_month(i["completed_at"])), key=lambda i: i["completed_at"], reverse=True
        ):
            done_day = issue["completed_at"].astimezone(zone).date()
            due = issue["target_date"]
            delivered.append(
                {
                    "id": str(issue["id"]),
                    "sequence_id": sequences.get(issue["id"]),
                    "name": issue["name"],
                    "category": issue["category"],
                    "completed_at": issue["completed_at"],
                    "target_date": due,
                    "on_time": None if due is None else done_day <= due,
                }
            )
        requested = Counter(i["category"] for i in pieces if in_month(i["created_at"]))
        delivered_by_category = Counter(i["category"] for i in delivered)
        open_now = Counter(i["state__group"] for i in pieces if i["state__group"] in OPEN_GROUPS)
        with_due = [i for i in delivered if i["on_time"] is not None]

        # Refações no mês (entradas num estado de retrabalho)
        rework_states = {
            state.id: state.name.lower()
            for state in State.objects.filter(project=project)
            if _is_rework_state(state.name)
        }
        rework_rows = list(
            IssueActivity.objects.filter(
                project=project,
                field="state",
                new_identifier__in=list(rework_states),
                created_at__gte=start,
                created_at__lt=end,
            ).values_list("new_identifier", flat=True)
        )
        origins = Counter(
            "client"
            if "cliente" in rework_states.get(s, "")
            else "internal"
            if "interno" in rework_states.get(s, "")
            else "other"
            for s in rework_rows
        )

        # Horas no mês
        now = timezone.now()
        hours_by_user, hours_by_issue, total_seconds = {}, defaultdict(int), 0
        for entry in IssueTimeEntry.objects.filter(
            project=project, started_at__gte=start, started_at__lt=end
        ).select_related("user", "issue"):
            seconds = entry_seconds(entry, now)
            total_seconds += seconds
            row = hours_by_user.setdefault(entry.user_id, {**_person(entry.user), "seconds": 0})
            row["seconds"] += seconds
            hours_by_issue[(entry.issue_id, entry.issue.name, entry.issue.sequence_id)] += seconds

        # Reuniões e atas no mês
        meetings = [
            {
                "id": str(event.id),
                "summary": event.summary,
                "start": event.start,
                "issue_id": str(event.issue_id),
                "issue_name": event.issue.name,
                "issue_sequence_id": event.issue.sequence_id,
            }
            for event in IssueCalendarEvent.objects.filter(project=project, start__gte=start, start__lt=end)
            .select_related("issue")
            .order_by("start")
        ]
        recordings = list(
            MeetingRecording.objects.filter(project=project, started_at__gte=start, started_at__lt=end)
            .select_related("issue")
            .order_by("started_at")
        )
        minutes = [
            {
                "id": str(r.id),
                "title": r.title,
                "started_at": r.started_at,
                "issue_id": str(r.issue_id),
                "issue_sequence_id": r.issue.sequence_id,
                "client_visible": r.client_visible,
                "resumo": (r.summary or {}).get("resumo", ""),
            }
            for r in recordings
            if r.summary_status == MeetingRecording.SummaryStatus.PUBLISHED
        ]

        # Contrato (portal)
        try:
            client = get_project_contract(project.id)
            contract_status = "ok" if client else "no_client"
        except PortalUnavailable:
            client, contract_status = None, "unavailable"
        contract = client["contract"] if client else None

        return Response(
            {
                "project": {"id": str(project.id), "name": project.name, "identifier": project.identifier},
                "month": first.strftime("%Y-%m"),
                "start": first.isoformat(),
                "end": (following - timedelta(days=1)).isoformat(),
                "generated_at": now,
                "client_name": client["client_name"] if client else None,
                "contract_status": contract_status,
                "contract": contract,
                "balance": availability(contract, issues)["categories"] if contract else [],
                "pieces": {
                    "requested": [{"category": c, "count": requested.get(c, 0)} for c in CATEGORIES],
                    "delivered": [{"category": c, "count": delivered_by_category.get(c, 0)} for c in CATEGORIES],
                    "delivered_total": len(delivered),
                    "requested_total": sum(requested.values()),
                    "on_time": sum(1 for i in with_due if i["on_time"]),
                    "with_due_date": len(with_due),
                    "open_now": {group: open_now.get(group, 0) for group in OPEN_GROUPS},
                    "delivered_items": delivered,
                },
                "reworks": {
                    "total": len(rework_rows),
                    "internal": origins.get("internal", 0),
                    "client": origins.get("client", 0),
                },
                "hours": {
                    "total_seconds": total_seconds,
                    "client_visible": project.time_tracking_client_visible,
                    "by_user": sorted(hours_by_user.values(), key=lambda r: r["seconds"], reverse=True),
                    "top_items": [
                        {"id": str(issue_id), "name": name, "sequence_id": seq, "seconds": seconds}
                        for (issue_id, name, seq), seconds in sorted(
                            hours_by_issue.items(), key=lambda item: item[1], reverse=True
                        )[:10]
                    ],
                },
                "meetings": {"items": meetings, "recorded": len(recordings), "minutes": minutes},
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceWorkloadEndpoint(BaseAPIView):
    """A carga da equipe agora. ``?project=<id>`` limita a um cliente."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        zone = _zone(workspace)
        today = timezone.now().astimezone(zone).date()
        week_start = today - timedelta(days=today.weekday())
        soon = today + timedelta(days=7)
        project_filter = Q()
        project_id = request.GET.get("project")
        if project_id:
            try:
                project_filter = Q(project_id=uuid.UUID(project_id))
            except ValueError:
                return Response({"error": "INVALID_FILTER"}, status=status.HTTP_400_BAD_REQUEST)

        members = {
            m.member_id: m.member
            for m in WorkspaceMember.objects.filter(workspace=workspace, is_active=True, role__gte=ROLE.MEMBER.value)
            .select_related("member")
            .order_by("member__display_name")
        }
        rows = {
            user_id: {
                **_person(user),
                "open": 0,
                "started": 0,
                "overdue": 0,
                "due_soon": 0,
                "subtasks_open": 0,
                "subtasks_overdue": 0,
                "week_seconds": 0,
                "projects": Counter(),
                "upcoming": [],
            }
            for user_id, user in members.items()
        }

        assignments = (
            IssueAssignee.objects.filter(
                project_filter,
                workspace=workspace,
                assignee_id__in=list(members),
                issue__deleted_at__isnull=True,
                issue__archived_at__isnull=True,
                issue__is_draft=False,
                issue__project__archived_at__isnull=True,
                issue__state__group__in=OPEN_GROUPS,
            )
            .select_related("issue", "issue__state", "issue__project")
            .order_by("issue__target_date")
        )
        for assignment in assignments:
            issue = assignment.issue
            row = rows[assignment.assignee_id]
            row["open"] += 1
            row["projects"][issue.project.identifier] += 1
            if issue.state.group == "started":
                row["started"] += 1
            if issue.target_date and issue.target_date < today:
                row["overdue"] += 1
            elif issue.target_date and issue.target_date <= soon:
                row["due_soon"] += 1
            if issue.target_date and len(row["upcoming"]) < 6:
                row["upcoming"].append(
                    {
                        "id": str(issue.id),
                        "name": issue.name,
                        "sequence_id": issue.sequence_id,
                        "project_identifier": issue.project.identifier,
                        "target_date": issue.target_date,
                        "overdue": issue.target_date < today,
                    }
                )

        for item in IssueChecklistItem.objects.filter(
            project_filter,
            workspace=workspace,
            assignee_id__in=list(members),
            is_completed=False,
            issue__deleted_at__isnull=True,
        ).values("assignee_id", "due_date"):
            row = rows[item["assignee_id"]]
            row["subtasks_open"] += 1
            if item["due_date"] and item["due_date"] < today:
                row["subtasks_overdue"] += 1

        now = timezone.now()
        for entry in IssueTimeEntry.objects.filter(
            project_filter,
            workspace=workspace,
            user_id__in=list(members),
            started_at__gte=datetime.combine(week_start, time.min, tzinfo=zone),
        ):
            rows[entry.user_id]["week_seconds"] += entry_seconds(entry, now)

        result = []
        for row in rows.values():
            row["projects"] = [{"identifier": k, "count": v} for k, v in row["projects"].most_common()]
            result.append(row)
        result.sort(key=lambda r: (-r["open"], r["display_name"].lower()))
        return Response(
            {"today": today.isoformat(), "week_start": week_start.isoformat(), "people": result},
            status=status.HTTP_200_OK,
        )
