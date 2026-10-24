# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: comentários só da equipe. Hoje são os sinais automáticos do briefing (Laya), que falam do cliente
("parece insatisfeito") e não podem aparecer para o próprio cliente, que entra no Pespo Hub como convidado.
Eles são marcados pelo ``external_source`` e somem das listas de comentários para convidados do projeto.
"""

# Module imports
from plane.db.models import ProjectMember

LAYA_COMMENT_SOURCE = "pespo_laya"
TEAM_ONLY_COMMENT_SOURCES = (LAYA_COMMENT_SOURCE,)
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
