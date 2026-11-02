# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: tarefas do Acervo (Nextcloud): a pasta do projeto que acabou de nascer e a olhada em ``Recebido/`` das
peças com link de envio ativo, a cada 10 min (``pespo-acervo-check-received`` no beat). Rodam no bgworker, que
precisa alcançar o Nextcloud pela rede ``portal-cliente_proxy``."""

# Python imports
import logging

# Third party imports
from celery import shared_task

# Module imports
from plane.db.models import Project
from plane.utils import acervo
from plane.utils.nextcloud import NextcloudError

logger = logging.getLogger("plane.worker")


@shared_task(bind=True, max_retries=3)
def create_project_folder(self, project_id):
    if not acervo.is_enabled():
        return None
    project = Project.objects.filter(pk=project_id).select_related("workspace").first()
    if project is None:
        return None
    try:
        return acervo.ensure_project_folder(project, acervo.get_client())
    except NextcloudError as e:
        logger.warning("Acervo: pasta do projeto %s não criada: %s", project_id, e)
        raise self.retry(exc=e, countdown=300)


@shared_task
def check_received_material():
    """Avisa a equipe das peças que receberam arquivo novo. Nextcloud fora do ar: para e tenta tudo na próxima."""
    if not acervo.is_enabled():
        return 0
    client = acervo.get_client()
    notified = 0
    for folder in acervo.folders_to_check():
        try:
            if acervo.check_received(folder, client):
                notified += 1
        except NextcloudError as e:
            logger.warning("Acervo: checagem de material recebido parou em %s: %s", folder.path, e)
            break
        except Exception:
            logger.exception("Acervo: checagem de material recebido falhou em %s", folder.path)
    return notified
