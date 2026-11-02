# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: aprovação de peças dentro do Hub (antes, os workflows "Gate de Aprovação" e "Peça Aprovada" do n8n).

- **Trava na hora:** mudar uma peça para "Aprovada - Pronta pra Ativar" enquanto ela ainda está bloqueada por
  outro item aberto (relação "bloqueado por", como a reunião de aprovação) é recusado com 400
  ``APPROVAL_BLOCKED`` e a lista do que falta. Vale para toda mudança feita por alguém (item, quadro, lista,
  API); tarefas do sistema, sem usuário na requisição, não são travadas. O n8n deixava mudar e desfazia
  segundos depois.
- **Registro:** grava uma ``PieceApproval`` (quem, quando, de onde), no lugar da tabela ``peca_aprovacoes`` do
  portal, nos dois caminhos de aprovação:
  - ``source="review"``: o botão "Aprovar peça" da revisão (1.6), que posta o comentário fixo
    "✅ Peça aprovada por <nome> em <dd/mm/aaaa>" (o mesmo que o n8n "Peça Aprovada" ouvia);
  - ``source="state"``: a mudança aceita para "Aprovada - Pronta pra Ativar".
  A mesma peça pode ter os dois; o relatório conta peças, não registros.
- **Em nome do cliente:** a equipe lança, pela revisão, a aprovação que o cliente deu por fora (WhatsApp, e-mail,
  reunião). O comentário diz "por <cliente> (via <canal>, lançado por <pessoa>)"; o registro fica com quem lançou,
  ``on_behalf_of_client`` e o canal, e o relatório conta como aprovação do cliente."""

# Python imports
import re
import unicodedata

# Django imports
from django.conf import settings
from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

# Third party imports
from crum import get_current_request, get_current_user
from rest_framework import status
from rest_framework.exceptions import APIException

# Module imports
from .issue import Issue, IssueComment, IssueRelation
from .project import ProjectBaseModel
from .state import State

APPROVAL_STATE = "aprovada - pronta pra ativar"
# texto fixo do botão "Aprovar peça" (media-review/review.tsx, handleApprove); o painel de peças lê o mesmo formato
APPROVAL_COMMENT_RE = re.compile(r"^\s*✅ Pe[cç]a aprovada por (.+?) em (\d{2}/\d{2}/\d{4})\s*$")
# aprovação lançada pela equipe em nome do cliente: "por <cliente> (via <canal>, lançado por <pessoa>)"
ON_BEHALF_RE = re.compile(r"^(.+?) \(via (.+?), lan[cç]ado por (.+)\)$")


def normalize_state_name(name):
    """Sem acento, minúsculas, traços iguais e espaços simples: "Aprovada – Pronta pra Ativar" casa."""
    # os traços tipográficos viram "-" antes de tirar os acentos (o ASCII apagaria o traço junto)
    text = re.sub(r"[‐-―]", "-", name or "")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", text).strip()


def is_approval_state(state):
    return state is not None and normalize_state_name(state.name) == APPROVAL_STATE


def open_blockers(issue_id):
    """Os itens que ainda bloqueiam esta peça (não concluídos nem cancelados)."""
    relations = (
        IssueRelation.objects.filter(
            issue_id=issue_id,
            relation_type="blocked_by",
            related_issue__deleted_at__isnull=True,
        )
        .exclude(related_issue__state__group__in=["completed", "cancelled"])
        .select_related("related_issue", "related_issue__project")
    )
    return [
        {
            "id": str(relation.related_issue_id),
            "name": relation.related_issue.name,
            "sequence_id": relation.related_issue.sequence_id,
            "project_identifier": relation.related_issue.project.identifier,
        }
        for relation in relations
    ]


class ApprovalBlocked(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "APPROVAL_BLOCKED"

    def __init__(self, blockers):
        super().__init__(detail={"error": "APPROVAL_BLOCKED", "blockers": blockers}, code="APPROVAL_BLOCKED")


def _approver_role(project_id, user):
    """ "client" (convidado do projeto), "team" (membro ou admin) ou "" (sem usuário ou fora do projeto)."""
    if user is None or user.is_anonymous:
        return ""
    from .project import ProjectMember  # noqa: PLC0415 (evita import circular no carregamento dos modelos)

    member_role = (
        ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
    )
    return "client" if member_role == 5 else "team" if member_role else ""


class PieceApproval(ProjectBaseModel):
    SOURCE_STATE = "state"
    SOURCE_REVIEW = "review"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="piece_approvals")
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    approved_at = models.DateTimeField(auto_now_add=True)
    # "client" (convidado do projeto) ou "team" (alguém da equipe, por exemplo aprovação recebida por WhatsApp)
    approved_by_role = models.CharField(max_length=16, blank=True, default="")
    state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    # "state" (mudou para "Aprovada - Pronta pra Ativar") ou "review" (botão "Aprovar peça" da revisão)
    source = models.CharField(max_length=16, default=SOURCE_STATE)
    # a equipe lançou a aprovação que o cliente deu por fora (WhatsApp, e-mail, reunião…); quem lançou é approved_by
    on_behalf_of_client = models.BooleanField(default=False, db_default=False)
    channel = models.CharField(max_length=32, blank=True, default="", db_default="")

    class Meta:
        verbose_name = "Piece Approval"
        verbose_name_plural = "Piece Approvals"
        db_table = "piece_approvals"
        ordering = ("-approved_at",)
        indexes = [models.Index(fields=["project", "-approved_at"], name="piece_approval_project_idx")]

    def __str__(self):
        return f"{self.issue_id} {self.approved_at:%Y-%m-%d}"


@receiver(pre_save, sender=Issue)
def pespo_approval_gate(sender, instance, **kwargs):
    instance._pespo_approved = False
    # o estado de antes de uma mudança de estado; os avisos ao cliente (pespo_client_notice) também usam
    instance._pespo_previous_state_id = None
    if instance._state.adding or not instance.pk or not instance.state_id:
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and not {"state", "state_id"} & set(update_fields):
        return  # salvamento parcial sem o estado: nada a conferir (evita uma consulta a cada save)
    previous_state_id = Issue.all_objects.filter(pk=instance.pk).values_list("state_id", flat=True).first()
    if previous_state_id == instance.state_id:
        return
    instance._pespo_previous_state_id = previous_state_id
    state = State.all_state_objects.filter(pk=instance.state_id).only("id", "name").first()
    if not is_approval_state(state):
        return
    if get_current_request() is not None:
        blockers = open_blockers(instance.pk)
        if blockers:
            raise ApprovalBlocked(blockers)
    instance._pespo_approved = True


@receiver(post_save, sender=Issue)
def pespo_record_approval(sender, instance, created, **kwargs):
    if created or not getattr(instance, "_pespo_approved", False):
        return
    instance._pespo_approved = False
    user = get_current_user()
    user = user if user is not None and not user.is_anonymous else None
    PieceApproval.objects.create(
        issue=instance,
        project_id=instance.project_id,
        workspace_id=instance.workspace_id,
        approved_by=user,
        approved_by_role=_approver_role(instance.project_id, user),
        state_id=instance.state_id,
        source=PieceApproval.SOURCE_STATE,
    )


@receiver(post_save, sender=IssueComment)
def pespo_record_review_approval(sender, instance, created, **kwargs):
    match = APPROVAL_COMMENT_RE.match(instance.comment_stripped or "") if created else None
    if not match:
        return
    user = instance.actor if instance.actor_id else get_current_user()
    user = user if user is not None and not user.is_anonymous else None
    role = _approver_role(instance.project_id, user)
    on_behalf = ON_BEHALF_RE.match(match.group(1).strip()) if role == "team" else None
    PieceApproval.objects.create(
        issue_id=instance.issue_id,
        project_id=instance.project_id,
        workspace_id=instance.workspace_id,
        approved_by=user,
        approved_by_role=role,
        source=PieceApproval.SOURCE_REVIEW,
        on_behalf_of_client=on_behalf is not None,
        channel=on_behalf.group(2).strip()[:32] if on_behalf else "",
    )
