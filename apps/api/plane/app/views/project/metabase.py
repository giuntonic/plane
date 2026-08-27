# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: embed de dashboard do Metabase por projeto.

Segue o mesmo mecanismo do portal-cliente (ver portal-cliente/portal-app/lib/
metabaseEmbed.js): um token JWT assinado com METABASE_SECRET_KEY, com o
parâmetro "cliente" travado no valor configurado pro projeto — o Metabase
nunca deixa o navegador escolher esse valor.
"""

import time

import jwt
from django.conf import settings
from rest_framework.response import Response
from rest_framework import status

from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Project


class ProjectMetabaseEmbedEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        if not project.metabase_dashboard_id or not settings.METABASE_SITE_URL or not settings.METABASE_SECRET_KEY:
            return Response({"configured": False, "url": None}, status=status.HTTP_200_OK)

        payload = {
            "resource": {"dashboard": int(project.metabase_dashboard_id)},
            "params": {"cliente": project.metabase_cliente_id},
            "exp": round(time.time()) + settings.METABASE_TOKEN_EXPIRES_MIN * 60,
        }
        token = jwt.encode(payload, settings.METABASE_SECRET_KEY, algorithm="HS256")
        url = f"{settings.METABASE_SITE_URL}/embed/dashboard/{token}#bordered=false&titled=false"

        return Response({"configured": True, "url": url}, status=status.HTTP_200_OK)
