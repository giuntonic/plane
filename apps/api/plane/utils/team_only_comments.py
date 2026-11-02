# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: comentários só da equipe: os sinais automáticos do briefing (Laya), que falam do cliente ("parece
insatisfeito"), as atas de reunião publicadas só para a equipe e o aviso de material recebido no Acervo. Não
podem aparecer para o próprio cliente, que entra no Pespo Hub como convidado.
Eles são marcados pelo ``external_source`` e somem das listas de comentários para convidados do projeto.
"""

# Module imports
from plane.db.models import ProjectMember

LAYA_COMMENT_SOURCE = "pespo_laya"
# Ata de reunião publicada no item: só para a equipe, ou visível também para o cliente.
MEETING_TEAM_SOURCE = "pespo_meeting_team"
MEETING_CLIENT_SOURCE = "pespo_meeting"
# Aviso do Acervo: chegou material do cliente em Recebido/ (bot "Arquivos").
ACERVO_TEAM_SOURCE = "pespo_acervo_team"
TEAM_ONLY_COMMENT_SOURCES = (LAYA_COMMENT_SOURCE, MEETING_TEAM_SOURCE, ACERVO_TEAM_SOURCE)
GUEST_ROLE = 5


def is_project_guest(user, project_id):
    return ProjectMember.objects.filter(
        project_id=project_id, member_id=user.id, role=GUEST_ROLE, is_active=True
    ).exists()


def hide_team_only_comments(queryset, user, project_id):
    """Tira os comentários só da equipe quando quem pede é convidado do projeto."""
    if is_project_guest(user, project_id):
        return queryset.exclude(external_source__in=TEAM_ONLY_COMMENT_SOURCES)
    return queryset
