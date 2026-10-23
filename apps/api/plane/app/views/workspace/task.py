# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Max

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import WorkspaceUserTask, Workspace
from plane.app.serializers import WorkspaceUserTaskSerializer
from ..base import BaseViewSet
from plane.app.permissions import allow_permission, ROLE

SORT_ORDER_STEP = 10000


def _resolve_parent(owner, workspace_id, parent_id, task=None):
    """(parent, None) or (None, error_response). ``parent_id`` vazio = raiz. A tarefa-mãe
    precisa ser da mesma pessoa e do mesmo workspace, e não pode ser a própria tarefa nem
    uma das suas subtarefas."""
    if not parent_id:
        return None, None
    parent = WorkspaceUserTask.objects.filter(owner=owner, workspace_id=workspace_id, pk=parent_id).first()
    if not parent:
        return None, Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
    if task:
        ancestor = parent
        while ancestor:
            if ancestor.id == task.id:
                return None, Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
            ancestor = ancestor.parent
    return parent, None


def _next_sort_order(owner, workspace_id, parent):
    largest = WorkspaceUserTask.objects.filter(owner=owner, workspace_id=workspace_id, parent=parent).aggregate(
        largest=Max("sort_order")
    )["largest"]
    return (largest + SORT_ORDER_STEP) if largest is not None else 65535


class WorkspaceUserTaskViewSet(BaseViewSet):
    """Pespo: tarefas do widget "Tarefas" da home, privadas de cada usuário. A lista vem
    plana — o frontend monta a árvore pelo ``parent``."""

    model = WorkspaceUserTask
    use_read_replica = True

    def get_serializer_class(self):
        return WorkspaceUserTaskSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        parent, error = _resolve_parent(request.user, workspace.id, request.data.get("parent"))
        if error:
            return error

        serializer = WorkspaceUserTaskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                workspace_id=workspace.id,
                owner_id=request.user.id,
                parent=parent,
                sort_order=serializer.validated_data.get(
                    "sort_order", _next_sort_order(request.user, workspace.id, parent)
                ),
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        task = WorkspaceUserTask.objects.filter(pk=pk, workspace__slug=slug, owner=request.user).first()

        if task:
            extra = {}
            if "parent" in request.data:
                parent, error = _resolve_parent(request.user, task.workspace_id, request.data.get("parent"), task=task)
                if error:
                    return error
                extra["parent"] = parent
            serializer = WorkspaceUserTaskSerializer(task, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save(**extra)
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
        task = WorkspaceUserTask.objects.filter(pk=pk, workspace__slug=slug, owner=request.user).first()
        if not task:
            return Response({"error": "Task not found."}, status=status.HTTP_404_NOT_FOUND)
        # Exclusão definitiva: o CASCADE do parent leva junto as subtarefas.
        task.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        tasks = WorkspaceUserTask.objects.filter(workspace__slug=slug, owner=request.user)

        serializer = WorkspaceUserTaskSerializer(tasks, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
