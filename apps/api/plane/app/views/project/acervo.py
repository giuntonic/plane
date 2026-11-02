# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: pasta do projeto no Acervo (Nextcloud), em Configurações do projeto › Acervo.

A pasta nasce sozinha com o projeto (``NEXTCLOUD_ROOT/<nome do projeto>``); aqui o admin do projeto vê, cria (se
o projeto é de antes) ou troca por outra pasta do Acervo, com um seletor que lista as pastas. As peças que já têm
pasta continuam onde estão."""

# Python imports
import logging

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Project
from plane.utils import acervo
from plane.utils.nextcloud import NextcloudError, NextcloudNotFound, split_path

logger = logging.getLogger("plane.api")


def _project_data(project):
    enabled = acervo.is_enabled()
    return {
        "enabled": enabled,
        "folder": project.acervo_folder,
        "files_url": acervo.files_url(project.acervo_folder) if enabled and project.acervo_folder else None,
        "default_folder": acervo.default_project_folder(project),
    }


def _unavailable(error):
    logger.warning("Acervo: Nextcloud indisponível: %s", error)
    return Response({"error": "ACERVO_UNAVAILABLE"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ProjectAcervoEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        return Response(_project_data(project), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        """Sem ``folder``: cria a pasta padrão (ou a atual, se alguém apagou). Com ``folder``: passa a usar essa."""
        project = Project.objects.select_related("workspace").get(workspace__slug=slug, pk=project_id)
        if not acervo.is_enabled():
            return Response({"error": "ACERVO_DISABLED"}, status=status.HTTP_400_BAD_REQUEST)
        folder = request.data.get("folder")
        try:
            client = acervo.get_client()
            if folder:
                acervo.set_project_folder(project, folder, client)
            else:
                acervo.ensure_project_folder(project, client)
        except ValueError:
            return Response({"error": "INVALID_FOLDER"}, status=status.HTTP_400_BAD_REQUEST)
        except NextcloudError as e:
            return _unavailable(e)
        return Response(_project_data(project), status=status.HTTP_200_OK)


class ProjectAcervoBrowseEndpoint(BaseAPIView):
    """Seletor de pasta: as subpastas de uma pasta do Acervo, e criar uma nova."""

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        if not acervo.is_enabled():
            return Response({"error": "ACERVO_DISABLED"}, status=status.HTTP_400_BAD_REQUEST)
        path = acervo.normalize_browse_path(request.query_params.get("path"))
        if path is None:
            return Response({"error": "INVALID_FOLDER"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            folders = acervo.list_subfolders(path, acervo.get_client())
        except NextcloudNotFound:
            return Response({"error": "FOLDER_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        except NextcloudError as e:
            return _unavailable(e)
        parts = split_path(path)
        return Response(
            {
                "path": path,
                "parent": "/".join(parts[:-1]) if len(parts) > 1 else None,
                "selectable": acervo.normalize_folder(path) is not None,
                "folders": folders,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        """Pasta nova ``name`` dentro de ``path``."""
        if not acervo.is_enabled():
            return Response({"error": "ACERVO_DISABLED"}, status=status.HTTP_400_BAD_REQUEST)
        path = acervo.normalize_browse_path(request.data.get("path"))
        name = acervo.safe_name(request.data.get("name"), "")
        if path is None or not name:
            return Response({"error": "INVALID_FOLDER"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            acervo.get_client().make_folder(f"{path}/{name}")
        except NextcloudError as e:
            return _unavailable(e)
        return Response({"name": name, "path": f"{path}/{name}"}, status=status.HTTP_201_CREATED)
