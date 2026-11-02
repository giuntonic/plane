# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: registro dos avisos ao cliente e os gatilhos na mudança de estado da peça.

- **Peça entregue:** uma peça (item com etiqueta de categoria) entra num estado do grupo concluído.
- **Refação pronta:** a peça sai do estado de refação pedida pelo cliente ("Reprovado Cliente - Retrabalho")
  para um estado que não é de refação nem cancelado.
- **Contrato vencendo:** pela tarefa de vencimento (``bgtasks/pespo_contract_task.py``).

O envio é da tarefa ``send_client_notice``, depois do commit. O mesmo aviso para o mesmo item não sai de novo
em 12 horas (peça que vai e volta de estado)."""

# Python imports
from datetime import timedelta

# Django imports
from django.db import models, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

# Module imports
from plane.utils import client_notices
from .issue import Issue
from .project import ProjectBaseModel
from .state import State

REPEAT_WINDOW = timedelta(hours=12)


class ClientNotice(ProjectBaseModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, null=True, blank=True, related_name="pespo_client_notices"
    )
    contract = models.ForeignKey(
        "db.PespoContract", on_delete=models.SET_NULL, null=True, blank=True, related_name="client_notices"
    )
    kind = models.CharField(max_length=32)
    channel = models.CharField(max_length=16, default="email")
    # [{"id", "email", "name"}] no momento do envio
    recipients = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Client Notice"
        verbose_name_plural = "Client Notices"
        db_table = "pespo_client_notices"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["issue", "kind", "-created_at"], name="client_notice_issue_kind_idx")]

    def __str__(self):
        return f"{self.kind} {self.channel} {self.status}"


def queue_client_notice(project, kind, issue=None, contract=None):
    """Registra e agenda o aviso em cada canal ligado no projeto. Devolve os avisos criados."""
    channels = client_notices.enabled_channels(project, kind)
    if not channels:
        return []
    if (
        issue is not None
        and ClientNotice.objects.filter(issue=issue, kind=kind, created_at__gte=timezone.now() - REPEAT_WINDOW).exists()
    ):
        return []
    notices = []
    for channel in channels:
        notice = ClientNotice(project=project, issue=issue, contract=contract, kind=kind, channel=channel)
        notice.save(disable_auto_set_user=True)
        notices.append(notice)

    def _enqueue():
        from plane.bgtasks.pespo_client_notice_task import send_client_notice  # noqa: PLC0415

        for notice in notices:
            send_client_notice.delay(str(notice.id))

    transaction.on_commit(_enqueue)
    return notices


def queue_access_notice(project, email):
    """O e-mail "Seu acesso ao Pespo Hub" para um login recém-liberado (sai sempre, com o destinatário fixo)."""
    notice = ClientNotice(
        project=project,
        kind=client_notices.ACCESS,
        channel="email",
        recipients=[{"id": "", "email": email, "name": ""}],
    )
    notice.save(disable_auto_set_user=True)

    def _enqueue():
        from plane.bgtasks.pespo_client_notice_task import send_client_notice  # noqa: PLC0415

        send_client_notice.delay(str(notice.id))

    transaction.on_commit(_enqueue)
    return notice


def _is_piece(issue):
    from plane.utils.pieces import CATEGORIES  # noqa: PLC0415

    return issue.label_issue.filter(label__name__in=CATEGORIES, deleted_at__isnull=True).exists()


def _is_client_rework(state):
    from plane.utils.pieces import _is_rework_state  # noqa: PLC0415

    return state is not None and _is_rework_state(state.name) and "cliente" in state.name.lower()


@receiver(post_save, sender=Issue)
def pespo_client_notice_on_state_change(sender, instance, created, **kwargs):
    previous_state_id = getattr(instance, "_pespo_previous_state_id", None)
    if created or previous_state_id is None:
        return
    instance._pespo_previous_state_id = None
    states = {s.id: s for s in State.all_state_objects.filter(pk__in=[previous_state_id, instance.state_id])}
    previous, current = states.get(previous_state_id), states.get(instance.state_id)
    if current is None:
        return
    if current.group == "completed" and (previous is None or previous.group != "completed"):
        kind = client_notices.DELIVERED
    elif _is_client_rework(previous) and not _is_client_rework(current) and current.group != "cancelled":
        from plane.utils.pieces import _is_rework_state  # noqa: PLC0415

        if _is_rework_state(current.name):
            return
        kind = client_notices.REWORK_DONE
    else:
        return
    if not _is_piece(instance):
        return
    queue_client_notice(instance.project, kind, issue=instance)
