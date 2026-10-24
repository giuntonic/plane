# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: painel de peças do projeto de um cliente (quantidade de peças, saldo do contrato, refações) e
solicitação de peças novas.

As regras de saldo são as mesmas do portal do cliente (portal-cliente/portal-app/server.js,
``getDisponibilidade`` e ``criarSolicitacao``), para os dois mostrarem os mesmos números:

- Peça = item com etiqueta de categoria (Post, Reels, Artigo, Anuncio). Itens cancelados não contam.
- Só contam para o saldo os itens criados depois do início do contrato ativo.
- Urgentes: FEP conta o contrato inteiro; FEE só o mês corrente. Além do limite do contrato, no máximo
  3 urgentes abertas ao mesmo tempo por projeto; vale o menor dos dois.
- Pedido novo entra no estado "Fila de Criacao", com a etiqueta da categoria (+ Urgente, + Precisa
  Impressao), um pedido por vez por projeto (trava no Postgres), no máximo 30 peças.

Refação = o item entrou num estado de retrabalho ("Reprovado Interno - Retrabalho", "Reprovado Cliente -
Retrabalho"), contado pelo histórico de estados do item.
"""

# Python imports
import html
import json
from collections import Counter
from datetime import date, datetime, time, timezone as dt_timezone
from zoneinfo import ZoneInfo

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.utils import timezone

# Module imports
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueActivity, IssueComment, IssueLabel, Label, State
from plane.utils.uuid import convert_uuid_to_integer
from plane.utils.work_item_tree import apply_extras, date_shifter, project_context

CATEGORIES = ["Post", "Reels", "Artigo", "Anuncio"]
URGENT_LABEL = "Urgente"
PRINT_LABEL = "Precisa Impressao"
PRINT_LABEL_COLOR = "#8E44AD"
QUEUE_STATE = "Fila de Criacao"
MAX_SIMULTANEOUS_URGENT = 3
MAX_PIECES_PER_REQUEST = 30
MAX_PIECES_PER_LINE = 50
STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"]
SAO_PAULO = ZoneInfo("America/Sao_Paulo")


class PieceRequestError(Exception):
    def __init__(self, code, **params):
        super().__init__(code)
        self.code = code
        self.params = params


def _is_rework_state(name):
    name = (name or "").lower()
    return "retrabalho" in name or "refa" in name


def load_project_issues(project):
    """Itens do projeto com o grupo do estado e os nomes das etiquetas (uma consulta para cada)."""
    issues = list(
        Issue.issue_objects.filter(project=project).values(
            "id",
            "name",
            "state_id",
            "state__group",
            "state__name",
            "created_at",
            "completed_at",
            "target_date",
            "priority",
        )
    )
    labels_by_issue = {}
    for row in IssueLabel.objects.filter(project=project, issue__in=[i["id"] for i in issues]).values(
        "issue_id", "label__name"
    ):
        labels_by_issue.setdefault(row["issue_id"], set()).add(row["label__name"])
    for issue in issues:
        issue["labels"] = labels_by_issue.get(issue["id"], set())
        issue["category"] = next((c for c in CATEGORIES if c in issue["labels"]), None)
    return issues


def availability(contract, issues, now=None):
    """Saldo por categoria e urgentes disponíveis agora (``getDisponibilidade`` do portal)."""
    if not contract:
        return {"categories": [], "urgent": {"available": 0, "limit": 0, "open_now": 0, "max_simultaneous": 0}}
    now = now or timezone.now()
    # O portal compara com a data de início lida pelo Node (meia-noite UTC).
    start = datetime.combine(contract["start_date"], time.min, tzinfo=dt_timezone.utc)
    used = Counter()
    urgent_cumulative = 0
    urgent_open = 0
    now_utc = now.astimezone(dt_timezone.utc)
    for issue in issues:
        if issue["state__group"] == "cancelled":
            continue
        in_contract = issue["created_at"] >= start
        if in_contract:
            for category in CATEGORIES:
                if category in issue["labels"]:
                    used[category] += 1
        if URGENT_LABEL in issue["labels"]:
            if in_contract:
                created = issue["created_at"].astimezone(dt_timezone.utc)
                if contract["type"] == "FEP" or (created.year, created.month) == (now_utc.year, now_utc.month):
                    urgent_cumulative += 1
            if issue["state__group"] != "completed":
                urgent_open += 1

    categories = [
        {
            "category": row["category"],
            "contracted": row["contracted"],
            "used": used[row["category"]],
            "available": row["contracted"] - used[row["category"]],
        }
        for row in contract["categories"]
    ]
    return {
        "categories": categories,
        "urgent": {
            "available": min(contract["urgent_limit"] - urgent_cumulative, MAX_SIMULTANEOUS_URGENT - urgent_open),
            "limit": contract["urgent_limit"],
            "open_now": urgent_open,
            "max_simultaneous": MAX_SIMULTANEOUS_URGENT,
        },
    }


def panel(project, contract, issues, now=None):
    """Peças por situação, entregas do mês (em São Paulo) e refações."""
    now = now or timezone.now()
    pieces = [issue for issue in issues if issue["category"]]
    by_group = Counter(issue["state__group"] for issue in pieces)
    this_month = now.astimezone(SAO_PAULO).strftime("%Y-%m")
    delivered = sorted(
        (
            issue
            for issue in pieces
            if issue["completed_at"] and issue["completed_at"].astimezone(SAO_PAULO).strftime("%Y-%m") == this_month
        ),
        key=lambda issue: issue["completed_at"],
        reverse=True,
    )

    rework_states = {
        state.id: state.name for state in State.objects.filter(project=project) if _is_rework_state(state.name)
    }
    piece_ids = {issue["id"] for issue in pieces}
    activities = IssueActivity.objects.filter(
        project=project, field="state", new_identifier__in=list(rework_states), issue_id__in=piece_ids
    )
    if contract:
        activities = activities.filter(
            created_at__gte=datetime.combine(contract["start_date"], time.min, tzinfo=dt_timezone.utc)
        )
    rework_rows = list(activities.values("issue_id", "new_identifier"))
    per_piece = Counter(row["issue_id"] for row in rework_rows)
    names = {issue["id"]: issue["name"] for issue in pieces}

    def _origin(state_id):
        name = (rework_states.get(state_id) or "").lower()
        return "client" if "cliente" in name else "internal" if "interno" in name else "other"

    origins = Counter(_origin(row["new_identifier"]) for row in rework_rows)
    return {
        "total_pieces": len(pieces),
        "by_state_group": [{"group": group, "count": by_group.get(group, 0)} for group in STATE_GROUPS],
        "delivered_this_month": [
            {
                "id": str(issue["id"]),
                "name": issue["name"],
                "category": issue["category"],
                "completed_at": issue["completed_at"],
            }
            for issue in delivered
        ],
        "reworks": {
            "total": len(rework_rows),
            "internal": origins.get("internal", 0),
            "client": origins.get("client", 0),
            "in_rework_now": [
                {"id": str(issue["id"]), "name": issue["name"], "state": issue["state__name"]}
                for issue in pieces
                if issue["state_id"] in rework_states
            ],
            "most_reworked": [
                {"id": str(issue_id), "name": names.get(issue_id, ""), "count": count}
                for issue_id, count in per_piece.most_common(5)
            ],
        },
    }


def parse_request_items(raw_items):
    """Normaliza as linhas do pedido; erro se nada sobrar ou passar dos limites."""
    if not isinstance(raw_items, list):
        raise PieceRequestError("INVALID_ITEMS")
    items = []
    for raw in raw_items[:20]:
        if not isinstance(raw, dict) or raw.get("category") not in CATEGORIES:
            continue
        try:
            quantity = int(raw.get("quantity"))
        except (TypeError, ValueError):
            continue
        if quantity < 1 or quantity > MAX_PIECES_PER_LINE:
            continue
        desired = raw.get("desired_date")
        try:
            desired = date.fromisoformat(desired) if desired else None
        except (TypeError, ValueError):
            desired = None
        items.append(
            {
                "category": raw["category"],
                "quantity": quantity,
                "urgent": raw.get("urgent") is True,
                "needs_print": raw.get("needs_print") is True,
                "desired_date": desired,
            }
        )
    if not items:
        raise PieceRequestError("EMPTY_REQUEST")
    total = sum(item["quantity"] for item in items)
    if total > MAX_PIECES_PER_REQUEST:
        raise PieceRequestError("TOO_MANY_PIECES", max=MAX_PIECES_PER_REQUEST)
    return items


def request_pieces(project, user, contract, items, briefing, is_guest, origin=None):
    """Cria as peças pedidas, conferindo o saldo com dados frescos. Um pedido por vez por projeto."""
    with transaction.atomic():
        # Chave própria (a do Issue.save é o id do projeto puro): pedidos do mesmo projeto esperam um ao
        # outro, então o segundo já vê as peças que o primeiro criou.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [convert_uuid_to_integer(project.id) ^ 0x5045])
        if not contract:
            raise PieceRequestError("NO_ACTIVE_CONTRACT")
        current = availability(contract, load_project_issues(project))
        requested = Counter()
        requested_urgent = 0
        for item in items:
            requested[item["category"]] += item["quantity"]
            if item["urgent"]:
                requested_urgent += item["quantity"]
        available_by_category = {row["category"]: row["available"] for row in current["categories"]}
        for category, quantity in requested.items():
            available = max(0, available_by_category.get(category, 0))
            if quantity > available:
                raise PieceRequestError("NOT_ENOUGH", category=category, requested=quantity, available=available)
        urgent_available = max(0, current["urgent"]["available"])
        if requested_urgent > urgent_available:
            raise PieceRequestError("NOT_ENOUGH_URGENT", requested=requested_urgent, available=urgent_available)

        queue = State.objects.filter(project=project, name=QUEUE_STATE).first()
        labels = {label.name: label for label in Label.objects.filter(project=project)}
        if not queue or any(category not in labels for category in requested):
            raise PieceRequestError("PROJECT_NOT_READY")
        if any(item["needs_print"] for item in items) and PRINT_LABEL not in labels:
            labels[PRINT_LABEL] = Label.objects.create(
                project=project, workspace_id=project.workspace_id, name=PRINT_LABEL, color=PRINT_LABEL_COLOR
            )

        briefing = (briefing or "").strip()[:4000]
        description = f"<p>{html.escape(briefing).replace(chr(10), '<br/>')}</p>" if briefing else "<p></p>"
        requester = "pelo cliente" if is_guest else f"por {user.display_name or user.first_name or user.email}"
        ctx = project_context(project, user)
        no_shift = date_shifter(None, None, keep_unanchored_dates=True)
        created = []
        for item in items:
            label_ids = [labels[item["category"]].id]
            if item["urgent"] and URGENT_LABEL in labels:
                label_ids.append(labels[URGENT_LABEL].id)
            if item["needs_print"]:
                label_ids.append(labels[PRINT_LABEL].id)
            for _ in range(item["quantity"]):
                issue = Issue(
                    project=project,
                    name=f"{item['category']} — solicitado {requester}"[:255],
                    description_html=description,
                    state=queue,
                    target_date=item["desired_date"],
                )
                issue.save()
                apply_extras(
                    issue,
                    {"labels": [{"id": str(label_id)} for label_id in label_ids], "assignee_ids": []},
                    ctx,
                    no_shift,
                    origin=origin,
                )
                created.append(str(issue.id))
        return created


def rework_state(project):
    """Estado para onde vai a peça quando o cliente pede refação."""
    states = [state for state in State.objects.filter(project=project) if _is_rework_state(state.name)]
    return next((s for s in states if "cliente" in s.name.lower()), None) or (states[0] if states else None)


def request_rework(issue, user, reason, origin=None):
    """O cliente pede refação: a peça volta para retrabalho e o motivo fica num comentário."""
    target = rework_state(issue.project)
    if not target:
        raise PieceRequestError("REWORK_STATE_MISSING")
    reason = (reason or "").strip()[:2000]
    if not reason:
        raise PieceRequestError("REASON_REQUIRED")
    old_state_id = issue.state_id
    now = timezone.now()
    with transaction.atomic():
        if issue.state_id != target.id:
            issue.state = target
            issue.save()
        who = user.display_name or user.first_name or user.email
        day = now.astimezone(SAO_PAULO).strftime("%d/%m/%Y")
        comment = IssueComment.objects.create(
            issue=issue,
            project=issue.project,
            actor=user,
            comment_html=f"<p>🔁 Refação pedida por {html.escape(who)} em {day}: {html.escape(reason)}</p>",
        )
        epoch = int(now.timestamp())
        issue_id, project_id, actor_id = str(issue.id), str(issue.project_id), str(user.id)
        if old_state_id != target.id:
            transaction.on_commit(
                lambda: issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"state_id": str(target.id)}),
                    current_instance=json.dumps({"state_id": str(old_state_id) if old_state_id else None}),
                    actor_id=actor_id,
                    issue_id=issue_id,
                    project_id=project_id,
                    epoch=epoch,
                    notification=True,
                    origin=origin,
                )
            )
        comment_data = json.dumps(
            {"id": str(comment.id), "comment_html": comment.comment_html, "issue": issue_id}, cls=DjangoJSONEncoder
        )
        transaction.on_commit(
            lambda: issue_activity.delay(
                type="comment.activity.created",
                requested_data=comment_data,
                current_instance=None,
                actor_id=actor_id,
                issue_id=issue_id,
                project_id=project_id,
                epoch=epoch,
                notification=True,
                origin=origin,
            )
        )
    return {"state_id": str(target.id), "state_name": target.name, "comment_id": str(comment.id)}
