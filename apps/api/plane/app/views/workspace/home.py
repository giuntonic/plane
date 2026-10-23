# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from ..base import BaseAPIView
from plane.db.models.workspace import WorkspaceHomePreference
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Workspace, WorkspaceMember
from plane.app.serializers.workspace import WorkspaceHomePreferenceSerializer

# Third party imports
from rest_framework.response import Response
from rest_framework import status


class WorkspaceHomePreferenceViewSet(BaseAPIView):
    model = WorkspaceHomePreference

    def get_serializer_class(self):
        return WorkspaceHomePreferenceSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        existing = WorkspaceHomePreference.objects.filter(user=request.user, workspace_id=workspace.id)
        existing_keys = set(existing.values_list("key", flat=True))

        keys = [
            key
            for key, _ in WorkspaceHomePreference.HomeWidgetKeys.choices
            if key not in ["quick_tutorial", "new_at_plane"]
        ]
        missing_keys = [key for key in keys if key not in existing_keys]

        if missing_keys:
            # Pespo: a ordem é decrescente. Na primeira visita os widgets começam em 999,
            # 998…; um widget novo pra quem já tem a home montada entra no fim da grade.
            lowest = min(existing.values_list("sort_order", flat=True), default=None)
            first_sort_order = 1000 if lowest is None else lowest
            # O widget de agenda depende da conexão com o Google Calendar, que convidados
            # (clientes) não têm: pra eles começa desligado.
            is_guest = (
                WorkspaceMember.objects.filter(
                    workspace=workspace, member=request.user, is_active=True, role=ROLE.GUEST.value
                ).exists()
            )
            WorkspaceHomePreference.objects.bulk_create(
                [
                    WorkspaceHomePreference(
                        key=key,
                        user=request.user,
                        workspace=workspace,
                        sort_order=first_sort_order - index - 1,
                        is_enabled=not (is_guest and key == WorkspaceHomePreference.HomeWidgetKeys.GOOGLE_CALENDAR),
                    )
                    for index, key in enumerate(missing_keys)
                ],
                batch_size=10,
                ignore_conflicts=True,
            )

        preference = WorkspaceHomePreference.objects.filter(user=request.user, workspace_id=workspace.id)

        return Response(
            preference.values("key", "is_enabled", "config", "sort_order"),
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, key):
        preference = WorkspaceHomePreference.objects.filter(key=key, workspace__slug=slug, user=request.user).first()

        if preference:
            serializer = WorkspaceHomePreferenceSerializer(preference, data=request.data, partial=True)

            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Preference not found"}, status=status.HTTP_400_BAD_REQUEST)
