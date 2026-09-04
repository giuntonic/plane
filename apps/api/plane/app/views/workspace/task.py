# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import WorkspaceUserTask, Workspace
from plane.app.serializers import WorkspaceUserTaskSerializer
from ..base import BaseViewSet
from plane.app.permissions import allow_permission, ROLE


class WorkspaceUserTaskViewSet(BaseViewSet):
    model = WorkspaceUserTask
    use_read_replica = True

    def get_serializer_class(self):
        return WorkspaceUserTaskSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkspaceUserTaskSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id, owner_id=request.user.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        task = WorkspaceUserTask.objects.filter(pk=pk, workspace__slug=slug, owner=request.user).first()

        if task:
            serializer = WorkspaceUserTaskSerializer(task, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"detail": "Task not found."}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        try:
            task = WorkspaceUserTask.objects.get(pk=pk, workspace__slug=slug, owner=request.user)
            serializer = WorkspaceUserTaskSerializer(task)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except WorkspaceUserTask.DoesNotExist:
            return Response({"error": "Task not found."}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        task = WorkspaceUserTask.objects.get(pk=pk, workspace__slug=slug, owner=request.user)
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        tasks = WorkspaceUserTask.objects.filter(workspace__slug=slug, owner=request.user)

        serializer = WorkspaceUserTaskSerializer(tasks, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
