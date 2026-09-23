# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import CustomField, CustomFieldOption, IssueCustomFieldValue
from plane.app.serializers import (
    CustomFieldSerializer,
    CustomFieldOptionSerializer,
    IssueCustomFieldValueSerializer,
)


class CustomFieldViewSet(BaseViewSet):
    permission_classes = [ProjectEntityPermission]
    model = CustomField
    serializer_class = CustomFieldSerializer

    def get_queryset(self):
        return (
            CustomField.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
            )
            .prefetch_related("options")
            .select_related("workspace", "project")
        )

    def create(self, request, slug, project_id):
        serializer = CustomFieldSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, project_id, pk):
        custom_field = CustomField.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        serializer = CustomFieldSerializer(custom_field, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, pk):
        custom_field = CustomField.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        custom_field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomFieldOptionViewSet(BaseViewSet):
    permission_classes = [ProjectEntityPermission]
    model = CustomFieldOption
    serializer_class = CustomFieldOptionSerializer

    def create(self, request, slug, project_id, custom_field_id):
        custom_field = CustomField.objects.get(pk=custom_field_id, workspace__slug=slug, project_id=project_id)
        if custom_field.field_type not in ("dropdown", "multi_select"):
            return Response(
                {"error": "Options can only be added to dropdown or multi-select custom fields"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CustomFieldOptionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(project_id=project_id, custom_field_id=custom_field_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, project_id, custom_field_id, pk):
        option = CustomFieldOption.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, custom_field_id=custom_field_id
        )
        serializer = CustomFieldOptionSerializer(option, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, custom_field_id, pk):
        option = CustomFieldOption.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, custom_field_id=custom_field_id
        )
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueCustomFieldValueViewSet(BaseViewSet):
    permission_classes = [ProjectEntityPermission]
    model = IssueCustomFieldValue
    serializer_class = IssueCustomFieldValueSerializer

    def list(self, request, slug, project_id, issue_id):
        values = (
            IssueCustomFieldValue.objects.filter(workspace__slug=slug, project_id=project_id, issue_id=issue_id)
            .select_related("custom_field", "option")
            .prefetch_related("multi_select_options")
        )
        serializer = IssueCustomFieldValueSerializer(values, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, project_id, issue_id, custom_field_id):
        custom_field = CustomField.objects.get(pk=custom_field_id, workspace__slug=slug, project_id=project_id)
        value, _ = IssueCustomFieldValue.objects.get_or_create(
            workspace_id=custom_field.workspace_id,
            project_id=project_id,
            issue_id=issue_id,
            custom_field_id=custom_field_id,
        )
        serializer = IssueCustomFieldValueSerializer(value, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
