# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: clientes no Hub, no lugar da área Clientes do painel admin (decisões de 02/11/2026).

- **Novo cliente:** projeto (a partir de um modelo de projeto, com o fluxo de peças, as etiquetas, os módulos e o
  checklist de onboarding), cliente, contrato com as categorias, a equipe do projeto e os logins do cliente.
- **Renovar:** o contrato ativo vira "renovado" e nasce outro; com "somar o saldo", o que sobrou de cada
  categoria entra no novo (a mesma conta do painel admin e do painel de peças).
- **Logins do cliente:** cada e-mail vira convidado (papel 5) nos projetos do cliente. Quem já tem conta entra
  na hora; quem não tem ganha um convite já aceito e entra no projeto no primeiro login, por código no e-mail ou
  pelo Google. Nos dois casos sai o e-mail "Seu acesso ao Pespo Hub"."""

# Python imports
import re
import unicodedata
from datetime import date

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

# Third party imports
import jwt

# Module imports
from plane.db.models import (
    DEFAULT_STATES,
    EntityTemplate,
    Issue,
    PespoClient,
    PespoClientLogin,
    PespoContract,
    PespoContractCategory,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.utils.pieces import CATEGORIES, availability, load_project_issues

GUEST = 5
MAX_EMAILS = 20


class ClientError(Exception):
    def __init__(self, code, **params):
        super().__init__(code)
        self.code = code
        self.params = params


# --- validação ---------------------------------------------------------------------------------------------------


def _date(value, field):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as e:
        raise ClientError("INVALID_DATE", field=field) from e


def _int(value, field, minimum=0, maximum=10000):
    try:
        number = int(value)
    except (TypeError, ValueError) as e:
        raise ClientError("INVALID_NUMBER", field=field) from e
    if number < minimum or number > maximum:
        raise ClientError("INVALID_NUMBER", field=field)
    return number


def parse_contract(data):
    """{"contract_type", "start_date", "end_date", "urgent_limit", "quantities": {categoria: n}}."""
    contract_type = str(data.get("contract_type") or "").upper()
    if contract_type not in PespoContract.Type.values:
        raise ClientError("INVALID_CONTRACT_TYPE")
    start = _date(data.get("start_date"), "start_date")
    end = _date(data.get("end_date"), "end_date")
    if end < start:
        raise ClientError("END_BEFORE_START")
    quantities = data.get("quantities") or {}
    if not isinstance(quantities, dict):
        raise ClientError("INVALID_NUMBER", field="quantities")
    return {
        "contract_type": contract_type,
        "start_date": start,
        "end_date": end,
        "urgent_limit": _int(data.get("urgent_limit", 0), "urgent_limit", maximum=100),
        "quantities": {category: _int(quantities.get(category, 0), category) for category in CATEGORIES},
    }


def parse_emails(raw):
    """Lista ou texto (vírgula, ponto e vírgula, espaço ou linha); sem repetidos, em minúsculas."""
    if isinstance(raw, str):
        raw = re.split(r"[\s,;]+", raw)
    emails = []
    for value in raw or []:
        email = str(value or "").strip().lower()
        if not email or email in emails:
            continue
        try:
            validate_email(email)
        except ValidationError as e:
            raise ClientError("INVALID_EMAIL", email=email) from e
        emails.append(email)
    if len(emails) > MAX_EMAILS:
        raise ClientError("TOO_MANY_EMAILS", max=MAX_EMAILS)
    return emails


def suggest_identifier(name, workspace_id):
    """Sigla do projeto a partir do nome: iniciais das palavras (ou o começo do nome), sem acento, única."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().upper()
    words = re.findall(r"[A-Z0-9]+", plain)
    base = "".join(word[0] for word in words) if len(words) > 1 else (words[0] if words else "CLI")
    base = (base if len(base) >= 3 else (words[0] if words else "CLI"))[:5] or "CLI"
    taken = set(Project.objects.filter(workspace_id=workspace_id).values_list("identifier", flat=True))
    candidate, counter = base, 2
    while candidate in taken:
        candidate = f"{base[:4]}{counter}"
        counter += 1
    return candidate


# --- contrato ----------------------------------------------------------------------------------------------------


def _add_contract(client, parsed, extra=None):
    contract = PespoContract.objects.create(
        workspace_id=client.workspace_id,
        client=client,
        contract_type=parsed["contract_type"],
        start_date=parsed["start_date"],
        end_date=parsed["end_date"],
        urgent_limit=parsed["urgent_limit"],
        status=PespoContract.Status.ACTIVE,
    )
    for category in CATEGORIES:
        PespoContractCategory.objects.create(
            contract=contract,
            category=category,
            contracted=parsed["quantities"][category] + (extra or {}).get(category, 0),
        )
    return contract


def contract_balance(client, contract):
    """O que sobrou de cada categoria do contrato: contratado menos o pedido desde o início (sem os cancelados),
    somando os projetos do cliente (o contrato é um só). Negativo vira zero."""
    contracted = {c.category: c.contracted for c in contract.categories.all()}
    as_dict = {
        "type": contract.contract_type,
        "start_date": contract.start_date,
        "urgent_limit": contract.urgent_limit,
        "categories": [{"category": category, "contracted": n} for category, n in contracted.items()],
    }
    used = dict.fromkeys(contracted, 0)
    for project in client.projects.filter(archived_at__isnull=True):
        for row in availability(as_dict, load_project_issues(project))["categories"]:
            used[row["category"]] += row["used"]
    return {category: max(0, contracted.get(category, 0) - used.get(category, 0)) for category in CATEGORIES}


def renew_contract(client, data, actor):
    parsed = parse_contract(data)
    keep_balance = bool(data.get("keep_balance"))
    with transaction.atomic():
        active = (
            PespoContract.objects.select_for_update()
            .filter(client=client, status=PespoContract.Status.ACTIVE)
            .order_by("-start_date")
            .first()
        )
        balance = contract_balance(client, active) if (active and keep_balance) else {}
        if active:
            active.status = PespoContract.Status.RENEWED
            active.save(update_fields=["status", "updated_at"])
        contract = _add_contract(client, parsed, extra=balance)
        _record_renewal(client, active, contract, parsed, balance, actor)
    return contract, balance


def _record_renewal(client, previous, contract, parsed, balance, actor):
    """Um item no projeto, para o histórico ficar legível dentro do Hub (como o painel admin fazia)."""
    project = client.projects.filter(archived_at__isnull=True).order_by("created_at").first()
    if project is None:
        return
    lines = "".join(
        f"<li>{category}: {parsed['quantities'][category] + balance.get(category, 0)}"
        + (f" (novo {parsed['quantities'][category]} + saldo {balance[category]})" if balance.get(category) else "")
        + "</li>"
        for category in CATEGORIES
    )
    previous_text = (
        f"<p><strong>Contrato anterior:</strong> {previous.contract_type}, de {previous.start_date:%d/%m/%Y} a "
        f"{previous.end_date:%d/%m/%Y}.</p>"
        if previous
        else ""
    )
    backlog = State.objects.filter(project=project, group="backlog").order_by("sequence").first()
    Issue.objects.create(
        project=project,
        workspace_id=project.workspace_id,
        state=backlog,
        name=f"Contrato renovado — {contract.start_date:%d/%m/%Y}",
        description_html=(
            f"<p>Contrato {contract.contract_type} renovado no Hub por {actor.display_name}, de "
            f"{contract.start_date:%d/%m/%Y} a {contract.end_date:%d/%m/%Y}, com {contract.urgent_limit} "
            f"urgente(s).</p>{previous_text}<ul>{lines}</ul>"
        ),
    )


# --- logins ------------------------------------------------------------------------------------------------------


def _add_guest(project, user, actor):
    member = ProjectMember.objects.filter(project=project, member=user).first()
    if member is None:
        ProjectMember.objects.create(project=project, member=user, role=GUEST, created_by=actor)
    elif not member.is_active:
        member.is_active = True
        member.role = GUEST if member.role < 15 else member.role
        member.save(update_fields=["is_active", "role", "updated_at"])


def grant_access(client, emails, actor):
    """Libera os e-mails nos projetos do cliente. Devolve [{"email", "status"}] ("active" ou "invited")."""
    from plane.db.models.pespo_client_notice import queue_access_notice  # noqa: PLC0415

    projects = list(client.projects.filter(archived_at__isnull=True))
    results = []
    for email in emails:
        PespoClientLogin.objects.get_or_create(workspace_id=client.workspace_id, client=client, email=email)
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            workspace_member = WorkspaceMember.objects.filter(workspace_id=client.workspace_id, member=user).first()
            if workspace_member is None:
                WorkspaceMember.objects.create(
                    workspace_id=client.workspace_id, member=user, role=GUEST, created_by=actor
                )
            elif not workspace_member.is_active:
                workspace_member.is_active = True
                workspace_member.save(update_fields=["is_active", "updated_at"])
            for project in projects:
                _add_guest(project, user, actor)
            status = "active"
        else:
            # convite já aceito: o primeiro login (código ou Google) cria o membro, e attach_client_logins põe no
            # projeto. O e-mail de convite do Plane não sai; sai o "Seu acesso ao Pespo Hub".
            if not WorkspaceMemberInvite.objects.filter(workspace_id=client.workspace_id, email=email).exists():
                WorkspaceMemberInvite.objects.create(
                    workspace_id=client.workspace_id,
                    email=email,
                    role=GUEST,
                    accepted=True,
                    token=jwt.encode(
                        {"email": email, "client": str(client.id)}, settings.SECRET_KEY, algorithm="HS256"
                    ),
                    created_by=actor,
                )
            status = "invited"
        if projects:
            queue_access_notice(projects[0], email)
        results.append({"email": email, "status": status})
    return results


def revoke_access(client, email):
    """Tira o acesso do e-mail aos projetos do cliente (o membro fica inativo; o convite pendente sai)."""
    PespoClientLogin.objects.filter(client=client, email=email).delete(soft=False)
    projects = client.projects.all()
    ProjectMember.objects.filter(project__in=projects, member__email__iexact=email, role__lt=15).update(is_active=False)
    WorkspaceMemberInvite.objects.filter(workspace_id=client.workspace_id, email=email).delete()


def attach_client_logins(user):
    """Chamado depois do login e ao entrar num espaço de trabalho: põe o convidado nos projetos dos clientes que
    liberaram o e-mail dele. Não faz nada para quem não está em nenhum ``PespoClientLogin``."""
    if user is None or not getattr(user, "email", None):
        return 0
    added = 0
    logins = PespoClientLogin.objects.filter(email=user.email.lower()).select_related("client")
    for login in logins:
        if not WorkspaceMember.objects.filter(workspace_id=login.workspace_id, member=user, is_active=True).exists():
            continue
        for project in login.client.projects.filter(archived_at__isnull=True):
            if not ProjectMember.objects.filter(project=project, member=user, is_active=True).exists():
                _add_guest(project, user, None)
                added += 1
    return added


def login_rows(client):
    projects = list(client.projects.all())
    rows = []
    for login in client.logins.all():
        active = ProjectMember.objects.filter(
            project__in=projects, member__email__iexact=login.email, is_active=True
        ).exists()
        rows.append({"email": login.email, "status": "active" if active else "invited"})
    return rows


# --- novo cliente ------------------------------------------------------------------------------------------------


def create_client(workspace, data, actor):
    from plane.utils.entity_templates import apply_project_template  # noqa: PLC0415

    name = str(data.get("name") or "").strip()
    if not name or len(name) > 255:
        raise ClientError("NAME_REQUIRED")
    if Project.objects.filter(workspace=workspace, name__iexact=name).exists():
        raise ClientError("PROJECT_NAME_TAKEN")
    identifier = re.sub(r"[^A-Z0-9]", "", str(data.get("identifier") or "").upper())[:12] or suggest_identifier(
        name, workspace.id
    )
    if Project.objects.filter(workspace=workspace, identifier=identifier).exists():
        raise ClientError("IDENTIFIER_TAKEN", identifier=identifier)
    parsed = parse_contract(data)
    emails = parse_emails(data.get("emails"))
    template = None
    if data.get("template_id"):
        template = EntityTemplate.objects.filter(
            workspace=workspace, pk=data["template_id"], kind="project", project__isnull=True
        ).first()
        if template is None:
            raise ClientError("TEMPLATE_NOT_FOUND")
    member_ids = [str(m) for m in data.get("member_ids") or []]
    team = {
        str(m.member_id): m.role
        for m in WorkspaceMember.objects.filter(
            workspace=workspace, member_id__in=member_ids, is_active=True, role__gte=15
        )
    }

    with transaction.atomic():
        project = Project.objects.create(
            workspace=workspace,
            name=name,
            identifier=identifier,
            network=2,
            pieces_view=True,
            guest_view_all_features=True,
            created_by=actor,
        )
        ProjectMember.objects.create(project=project, member=actor, role=20, created_by=actor)
        State.objects.bulk_create(
            [
                State(
                    name=state["name"],
                    color=state["color"],
                    project=project,
                    sequence=state["sequence"],
                    workspace=workspace,
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=actor,
                )
                for state in DEFAULT_STATES
            ]
        )
        if template is not None:
            apply_project_template(template.data or {}, project, actor)
        for member_id, role in team.items():
            if member_id != str(actor.id):
                ProjectMember.objects.get_or_create(
                    project=project,
                    member_id=member_id,
                    defaults={"role": 20 if role >= 20 else 15, "created_by": actor},
                )
        client = PespoClient.objects.create(workspace=workspace, name=name, created_by=actor)
        client.projects.add(project)
        _add_contract(client, parsed)
    logins = grant_access(client, emails, actor) if emails else []
    return client, project, logins


def client_summary(client):
    active = next((c for c in client.contracts.all() if c.status == PespoContract.Status.ACTIVE), None)
    project = next(iter(client.projects.all()), None)
    return {
        "id": str(client.id),
        "name": client.name,
        "portal_client_id": client.portal_client_id,
        "project": (
            {"id": str(project.id), "name": project.name, "identifier": project.identifier} if project else None
        ),
        "contract": (
            {
                "id": str(active.id),
                "contract_type": active.contract_type,
                "start_date": active.start_date,
                "end_date": active.end_date,
                "urgent_limit": active.urgent_limit,
                "categories": [
                    {"category": c.category, "contracted": c.contracted}
                    for c in sorted(active.categories.all(), key=lambda c: c.category)
                ],
            }
            if active
            else None
        ),
        "logins": len(client.logins.all()),
    }


def client_detail(client):
    data = client_summary(client)
    data["contracts"] = [
        {
            "id": str(contract.id),
            "contract_type": contract.contract_type,
            "start_date": contract.start_date,
            "end_date": contract.end_date,
            "status": contract.status,
            "urgent_limit": contract.urgent_limit,
            "categories": [
                {"category": c.category, "contracted": c.contracted}
                for c in sorted(contract.categories.all(), key=lambda c: c.category)
            ],
        }
        for contract in sorted(client.contracts.all(), key=lambda c: c.start_date, reverse=True)
    ]
    active = next((c for c in client.contracts.all() if c.status == PespoContract.Status.ACTIVE), None)
    data["balance"] = contract_balance(client, active) if active else {}
    data["login_list"] = login_rows(client)
    return data
