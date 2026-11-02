# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: Acervo da peça no Nextcloud (arquivos.pespo.com.br), as regras do Hub.

Pastas: ``NEXTCLOUD_ROOT/<projeto>/<peça>/{Recebido,Entrega}`` (ex.: ``Acervo/Clientes/Padaria/Post Natal``). A
do projeto nasce junto com o projeto (``bgtasks/acervo_task.py``) e pode ser trocada nas configurações; a da peça,
no primeiro link. Renomear o projeto ou a peça depois não move nada: o Hub guarda o caminho.

Links: públicos do Nextcloud, ``upload`` (só envio, em ``Recebido/``) e ``delivery`` (leitura, em ``Entrega/``),
um ativo por tipo e peça, com ``NEXTCLOUD_LINK_DAYS`` dias de validade. A equipe gera, renova e revoga os dois; o
cliente (convidado) vê os ativos e pode gerar sozinho o de envio.

Aviso: o beat olha ``Recebido/`` das peças com link de envio ativo e, quando chega arquivo novo, comenta no item
como o bot "Arquivos" (só para a equipe) e notifica no Hub os responsáveis e quem segue o item (só da equipe)."""

# Python imports
import logging
import re
from datetime import timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

# Django imports
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.html import escape

# Module imports
from plane.db.models import (
    IssueAcervoFolder,
    IssueAcervoLink,
    IssueAssignee,
    IssueComment,
    IssueSubscriber,
    Notification,
    Project,
    ProjectMember,
    User,
)
from plane.db.models.user import BotTypeEnum
from plane.utils.nextcloud import (
    PERMISSION_CREATE,
    PERMISSION_READ,
    NextcloudClient,
    NextcloudError,
    NextcloudNotFound,
    split_path,
)
from plane.utils.team_only_comments import ACERVO_TEAM_SOURCE
from plane.utils.uuid import convert_uuid_to_integer

logger = logging.getLogger("plane.api")

RECEIVED_FOLDER = "Recebido"
DELIVERY_FOLDER = "Entrega"
MAX_NAME_LENGTH = 80
MAX_LINK_DAYS = 365
MAX_SAME_NAME = 200
TEAM_ROLES = (20, 15)
ACERVO_BOT_USERNAME = "pespo_acervo_bot"
ACERVO_BOT_EMAIL = "acervo-bot@pespo-hub.invalid"
DEFAULT_TIMEZONE = "America/Sao_Paulo"
# Barras e o que o Windows e os apps do Nextcloud recusam em nome de pasta.
_FORBIDDEN_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]')

UPLOAD = IssueAcervoLink.Kind.UPLOAD
DELIVERY = IssueAcervoLink.Kind.DELIVERY
KIND_FOLDER = {UPLOAD: RECEIVED_FOLDER, DELIVERY: DELIVERY_FOLDER}
KIND_PERMISSIONS = {UPLOAD: PERMISSION_CREATE, DELIVERY: PERMISSION_READ}


class AcervoDisabled(Exception):
    """Faltam ``NEXTCLOUD_URL``, ``NEXTCLOUD_USER`` ou ``NEXTCLOUD_APP_PASSWORD``."""


def is_enabled():
    return bool(settings.NEXTCLOUD_URL and settings.NEXTCLOUD_USER and settings.NEXTCLOUD_APP_PASSWORD)


def get_client():
    if not is_enabled():
        raise AcervoDisabled()
    return NextcloudClient(settings.NEXTCLOUD_URL, settings.NEXTCLOUD_USER, settings.NEXTCLOUD_APP_PASSWORD)


# --- Nomes e endereços -------------------------------------------------------------------------------------


def safe_name(name, fallback):
    """Nome de pasta a partir do nome do projeto ou da peça: sem barras nem os caracteres que o Windows e o app de
    desktop recusam, sem espaços nem pontos nas pontas, até ``MAX_NAME_LENGTH`` caracteres."""
    cleaned = _FORBIDDEN_CHARS.sub("-", name or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    cleaned = cleaned[:MAX_NAME_LENGTH].strip(" .")
    return cleaned or fallback


def normalize_folder(path):
    """Pasta escolhida para o projeto: dentro da pasta de cima do Acervo (a primeira parte de ``NEXTCLOUD_ROOT``,
    ``Acervo``), sem ser ela mesma. ``None`` se não vale."""
    try:
        parts = split_path(path)
    except ValueError:
        return None
    top = split_path(settings.NEXTCLOUD_ROOT)[:1]
    if len(parts) < 2 or parts[:1] != top:
        return None
    if any(_FORBIDDEN_CHARS.search(part) or len(part) > 255 for part in parts):
        return None
    return "/".join(parts)


def normalize_browse_path(path):
    """Pasta aberta no seletor das configurações: a pasta de cima do Acervo ou qualquer uma dentro dela."""
    if not path:
        return "/".join(split_path(settings.NEXTCLOUD_ROOT))
    try:
        parts = split_path(path)
    except ValueError:
        return None
    if not parts or parts[:1] != split_path(settings.NEXTCLOUD_ROOT)[:1]:
        return None
    return "/".join(parts)


def files_url(path):
    """A pasta no app Arquivos do Nextcloud (a equipe entra com o login Google; o Acervo aparece para todos)."""
    return f"{settings.NEXTCLOUD_PUBLIC_URL.rstrip('/')}/apps/files/files?dir={quote('/' + path)}"


def link_url(token):
    return f"{settings.NEXTCLOUD_PUBLIC_URL.rstrip('/')}/s/{quote(token, safe='')}"


def today_for(project):
    """Hoje no fuso do espaço de trabalho (a validade dos links é por dia)."""
    try:
        zone = ZoneInfo(project.workspace.timezone or DEFAULT_TIMEZONE)
    except (KeyError, ValueError):
        zone = ZoneInfo(DEFAULT_TIMEZONE)
    return timezone.now().astimezone(zone).date()


def format_size(size):
    """Tamanho em pt-BR: ``850 KB``, ``2,1 GB``."""
    value = float(size or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            break
        value /= 1024
    if unit in ("B", "KB") or value >= 100:
        return f"{value:.0f} {unit}"
    return f"{value:.1f} {unit}".replace(".", ",")


def is_visible_file(entry):
    """Esconde arquivos ocultos e pedaços de envio em andamento."""
    name = entry.get("name") or ""
    return bool(name) and not name.startswith(".") and not name.endswith(".part")


# --- Pastas ------------------------------------------------------------------------------------------------


def default_project_folder(project):
    return "/".join([*split_path(settings.NEXTCLOUD_ROOT), safe_name(project.name, "Projeto")])


def ensure_project_folder(project, client):
    """A pasta do projeto, criada se faltar (inclusive se alguém apagou no Nextcloud)."""
    path = project.acervo_folder or default_project_folder(project)
    client.make_folder(path)
    if not project.acervo_folder:
        # update() e não save(): não dispara o post_save do projeto nem mexe em outros campos.
        Project.objects.filter(pk=project.pk, acervo_folder="").update(acervo_folder=path)
        project.refresh_from_db(fields=["acervo_folder"])
    return project.acervo_folder


def set_project_folder(project, path, client):
    """Troca a pasta do projeto (cria se não existir). As peças que já têm pasta continuam onde estão."""
    folder = normalize_folder(path)
    if folder is None:
        raise ValueError("Invalid folder")
    client.make_folder(folder)
    Project.objects.filter(pk=project.pk).update(acervo_folder=folder)
    project.acervo_folder = folder
    return folder


def list_subfolders(path, client):
    _, children = client.list_folder(path)
    return sorted(
        ({"name": child["name"], "path": f"{path}/{child['name']}"} for child in children if child["is_folder"]),
        key=lambda item: item["name"].lower(),
    )


def get_issue_folder(issue):
    return IssueAcervoFolder.objects.filter(issue=issue).first()


def ensure_issue_folder(issue, client):
    """A pasta da peça, com ``Recebido/`` e ``Entrega/``. É sempre uma pasta nova: se já existe uma com o nome da
    peça no Nextcloud (de outra peça ou criada à mão), a peça ganha `` (2)``, `` (3)``… Aproveitar uma pasta que já
    existia mostraria o que está nela para quem tem acesso à peça, inclusive o cliente."""
    folder = get_issue_folder(issue)
    if folder is None:
        project_path = ensure_project_folder(issue.project, client)
        taken = set(IssueAcervoFolder.all_objects.filter(project_id=issue.project_id).values_list("path", flat=True))
        base = safe_name(issue.name, "Peça")
        for number in range(1, MAX_SAME_NAME + 1):
            path = f"{project_path}/{base}" if number == 1 else f"{project_path}/{base} ({number})"
            # make_folder devolve False quando a pasta já existia
            if path not in taken and client.make_folder(path):
                break
        else:
            raise NextcloudError(f"No free folder name for {base!r}")
        try:
            with transaction.atomic():
                folder = IssueAcervoFolder.objects.create(issue=issue, project_id=issue.project_id, path=path)
        except IntegrityError:
            folder = get_issue_folder(issue)
    for subfolder in (RECEIVED_FOLDER, DELIVERY_FOLDER):
        client.make_folder(f"{folder.path}/{subfolder}")
    return folder


def _visible_children(path, client):
    try:
        _, children = client.list_folder(path)
    except NextcloudNotFound:
        return []
    return [child for child in children if is_visible_file(child)]


def file_data(entry):
    return {
        "name": entry["name"],
        "size": entry["size"],
        "modified": entry["modified"].isoformat() if entry["modified"] else None,
        "is_folder": entry["is_folder"],
    }


def list_issue_files(folder, client):
    """O que tem em ``Recebido/`` e ``Entrega/``, do mais novo para o mais antigo."""
    result = {}
    for key, subfolder in (("received", RECEIVED_FOLDER), ("delivery", DELIVERY_FOLDER)):
        children = _visible_children(f"{folder.path}/{subfolder}", client)
        children.sort(key=lambda child: child["modified"].timestamp() if child["modified"] else 0, reverse=True)
        result[key] = [file_data(child) for child in children]
    return result


def snapshot_received(folder, client):
    """Fotografa ``Recebido/``: o que já está lá não gera aviso."""
    ids = sorted({child["file_id"] for child in _visible_children(f"{folder.path}/{RECEIVED_FOLDER}", client)})
    now = timezone.now()
    IssueAcervoFolder.objects.filter(pk=folder.pk).update(received_file_ids=ids, checked_at=now)
    folder.received_file_ids, folder.checked_at = ids, now


# --- Links -------------------------------------------------------------------------------------------------


def link_is_active(link, today):
    return link.revoked_at is None and (link.expires_on is None or link.expires_on >= today)


def active_link(issue, kind, today):
    for link in IssueAcervoLink.objects.filter(issue=issue, kind=kind, revoked_at__isnull=True):
        if link_is_active(link, today):
            return link
    return None


def link_data(link, today, include_folder=False):
    data = {
        "id": str(link.id),
        "kind": link.kind,
        "url": link_url(link.token),
        "expires_on": link.expires_on.isoformat() if link.expires_on else None,
        "is_active": link_is_active(link, today),
        "created_at": link.created_at,
    }
    if include_folder:
        data["files_url"] = files_url(link.path)
    return data


def _link_label(issue, kind):
    return f"Hub · {'envio' if kind == UPLOAD else 'entrega'} · {issue.name}"[:250]


def _link_note(issue, kind):
    """Recado que o Nextcloud mostra na página do link."""
    if kind == UPLOAD:
        return (
            f"Envie aqui o material da peça “{issue.name}”. Arquivos grandes podem demorar: deixe a página aberta "
            "até o envio terminar."
        )
    return f"Arquivos da peça “{issue.name}”, enviados pela Pespo."


def _new_share(issue, kind, path, expires_on, client):
    share = client.create_link(path, KIND_PERMISSIONS[kind], expires_on, label=_link_label(issue, kind))
    try:
        client.update_link(share["id"], note=_link_note(issue, kind))
    except NextcloudError as e:
        logger.warning("Acervo: link %s criado sem o recado: %s", share["id"], e)
    return share


def create_link(issue, kind, client):
    """O link ativo do tipo, ou um novo (cria as pastas se faltarem). ``(link, criado)``. Um pedido por peça por
    vez: dois cliques seguidos não geram dois links."""
    today = today_for(issue.project)
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [convert_uuid_to_integer(issue.id) ^ 0xACE5])
        existing = active_link(issue, kind, today)
        if existing:
            return existing, False
        folder = ensure_issue_folder(issue, client)
        path = f"{folder.path}/{KIND_FOLDER[kind]}"
        expires_on = today + timedelta(days=settings.NEXTCLOUD_LINK_DAYS)
        share = _new_share(issue, kind, path, expires_on, client)
        if kind == UPLOAD and folder.checked_at is None:
            snapshot_received(folder, client)
        link = IssueAcervoLink.objects.create(
            issue=issue,
            project_id=issue.project_id,
            kind=kind,
            path=path,
            share_id=share["id"],
            token=share["token"],
            expires_on=expires_on,
        )
    return link, True


def parse_expiry(value, today):
    """Nova validade escolhida na tela: de amanhã até ``MAX_LINK_DAYS`` dias. ``None`` se não vale."""
    try:
        day = parse_date(str(value or ""))
    except ValueError:
        return None
    if day is None or day <= today or day > today + timedelta(days=MAX_LINK_DAYS):
        return None
    return day


def change_link_expiry(link, expires_on, client):
    """Nova validade. Se o link já sumiu do Nextcloud (expirou e foi limpo), cria outro na mesma pasta: o endereço
    muda, e a tela mostra o novo."""
    try:
        client.update_link(link.share_id, expires_on=expires_on)
    except NextcloudNotFound:
        client.make_folder(link.path)
        share = _new_share(link.issue, link.kind, link.path, expires_on, client)
        link.share_id, link.token = share["id"], share["token"]
    link.expires_on = expires_on
    link.save(update_fields=["share_id", "token", "expires_on", "updated_at", "updated_by"])
    return link


def revoke_link(link, client):
    client.delete_link(link.share_id)
    link.revoked_at = timezone.now()
    link.save(update_fields=["revoked_at", "updated_at", "updated_by"])
    return link


# --- Aviso de material recebido ----------------------------------------------------------------------------


def folders_to_check():
    """Peças com link de envio ativo (ou vencido há no máximo um dia: o envio pode ter terminado no fim do prazo)."""
    since = timezone.now().date() - timedelta(days=1)
    issue_ids = IssueAcervoLink.objects.filter(kind=UPLOAD, revoked_at__isnull=True, expires_on__gte=since).values(
        "issue_id"
    )
    return IssueAcervoFolder.objects.filter(issue_id__in=issue_ids, issue__deleted_at__isnull=True).select_related(
        "issue", "issue__state", "project", "project__workspace"
    )


def check_received(folder, client):
    """Arquivos novos em ``Recebido/`` desde a última olhada; avisa a equipe se houver. Na primeira olhada só
    fotografa."""
    current = [child for child in _visible_children(f"{folder.path}/{RECEIVED_FOLDER}", client) if child.get("file_id")]
    seen = set(folder.received_file_ids or [])
    new_files = [child for child in current if child["file_id"] not in seen]
    first_look = folder.checked_at is None
    IssueAcervoFolder.objects.filter(pk=folder.pk).update(
        received_file_ids=sorted({child["file_id"] for child in current}), checked_at=timezone.now()
    )
    if first_look or not new_files:
        return []
    notify_received(folder, new_files)
    return new_files


def acervo_bot_user():
    user = User.objects.filter(username=ACERVO_BOT_USERNAME).first()
    if user:
        return user
    try:
        return User.objects.create(
            username=ACERVO_BOT_USERNAME,
            display_name="Arquivos",
            first_name="Arquivos",
            last_name="",
            is_bot=True,
            bot_type=BotTypeEnum.PESPO_ACERVO,
            email=ACERVO_BOT_EMAIL,
            password=make_password(None),
            is_password_autoset=True,
        )
    except IntegrityError:
        return User.objects.get(username=ACERVO_BOT_USERNAME)


def received_comment_html(files, folder_url):
    total = sum(entry["size"] for entry in files)
    count = len(files)
    names = "".join(f"<li><p>{escape(entry['name'])}</p></li>" for entry in files[:5])
    if count > 5:
        names += f"<li><p>e mais {count - 5}</p></li>"
    noun = "arquivo novo" if count == 1 else "arquivos novos"
    return (
        "<p><em>Aviso automático do Acervo. Este comentário aparece só para a equipe.</em></p>"
        f"<p>📥 Chegou material em <strong>Recebido</strong>: {count} {noun} ({format_size(total)}).</p>"
        f"<ul>{names}</ul>"
        f'<p><a href="{escape(folder_url)}" target="_blank" rel="noopener noreferrer">Abrir no Arquivos</a></p>'
    )


def team_receivers(issue):
    """Responsáveis e quem segue o item, só da equipe (admin e membro ativos do projeto). ``{id: sender}``."""
    assignees = set(IssueAssignee.objects.filter(issue=issue).values_list("assignee_id", flat=True))
    subscribers = set(IssueSubscriber.objects.filter(issue=issue).values_list("subscriber_id", flat=True))
    team = ProjectMember.objects.filter(
        project_id=issue.project_id,
        member_id__in=assignees | subscribers,
        role__in=TEAM_ROLES,
        is_active=True,
        member__is_bot=False,
    ).values_list("member_id", flat=True)
    return {
        member_id: "in_app:issue_activities:assigned"
        if member_id in assignees
        else "in_app:issue_activities:subscribed"
        for member_id in team
    }


def notify_received(folder, new_files):
    """Comentário só para a equipe, sem ``issue_activity`` (que mandaria e-mail ao cliente que segue o item), e
    notificação no Hub para os responsáveis e quem segue o item."""
    issue, project = folder.issue, folder.project
    bot = acervo_bot_user()
    comment = IssueComment.objects.create(
        issue=issue,
        project=project,
        actor=bot,
        comment_html=received_comment_html(new_files, files_url(f"{folder.path}/{RECEIVED_FOLDER}")),
        external_source=ACERVO_TEAM_SOURCE,
    )
    receivers = team_receivers(issue)
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=project.workspace_id,
                project=project,
                sender=sender,
                triggered_by=bot,
                receiver_id=receiver_id,
                entity_identifier=issue.id,
                entity_name="issue",
                title="Material recebido no Acervo",
                message_html=comment.comment_html,
                message_stripped=comment.comment_stripped,
                data={
                    "issue": {
                        "id": str(issue.id),
                        "name": str(issue.name),
                        "identifier": str(project.identifier),
                        "sequence_id": issue.sequence_id,
                        "state_name": issue.state.name if issue.state else "",
                        "state_group": issue.state.group if issue.state else "",
                    },
                    "issue_activity": {
                        "id": str(comment.id),
                        "verb": "created",
                        "field": "comment",
                        "actor": str(bot.id),
                        "new_value": comment.comment_html,
                        "old_value": "",
                        "issue_comment": comment.comment_stripped,
                        "old_identifier": None,
                        "new_identifier": None,
                    },
                },
            )
            for receiver_id, sender in receivers.items()
        ]
    )
    return comment
