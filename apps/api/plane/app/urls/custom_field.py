# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CustomFieldViewSet,
    CustomFieldOptionViewSet,
    IssueCustomFieldValueViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-fields/",
        CustomFieldViewSet.as_view({"get": "list", "post": "create"}),
        name="project-custom-fields",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-fields/<uuid:pk>/",
        CustomFieldViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-custom-fields",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-fields/<uuid:custom_field_id>/options/",
        CustomFieldOptionViewSet.as_view({"post": "create"}),
        name="custom-field-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/custom-fields/<uuid:custom_field_id>/options/<uuid:pk>/",
        CustomFieldOptionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="custom-field-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/custom-field-values/",
        IssueCustomFieldValueViewSet.as_view({"get": "list"}),
        name="issue-custom-field-values",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/custom-field-values/<uuid:custom_field_id>/",
        IssueCustomFieldValueViewSet.as_view({"patch": "partial_update"}),
        name="issue-custom-field-values",
    ),
]
