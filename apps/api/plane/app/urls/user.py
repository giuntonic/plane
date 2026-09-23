# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    AccountEndpoint,
    ProfileEndpoint,
    UpdateUserOnBoardedEndpoint,
    UpdateUserTourCompletedEndpoint,
    UserActivityEndpoint,
    UserActivityGraphEndpoint,
    ## User
    UserEndpoint,
    UserIssueCompletedGraphEndpoint,
    UserWorkspaceDashboardEndpoint,
    UserSessionEndpoint,
    ## End User
    ## Workspaces
    UserWorkSpacesEndpoint,
    ## Google Calendar
    GoogleCalendarConnectEndpoint,
    GoogleCalendarCallbackEndpoint,
    GoogleCalendarStatusEndpoint,
    GoogleCalendarPreferencesEndpoint,
    GoogleCalendarDisconnectEndpoint,
    GoogleCalendarSyncNowEndpoint,
    GoogleCalendarEventsEndpoint,
    ## End Google Calendar
)

urlpatterns = [
    # User Profile
    path(
        "users/me/",
        UserEndpoint.as_view({"get": "retrieve", "patch": "partial_update", "delete": "deactivate"}),
        name="users",
    ),
    path("users/session/", UserSessionEndpoint.as_view(), name="user-session"),
    path(
        "users/me/settings/",
        UserEndpoint.as_view({"get": "retrieve_user_settings"}),
        name="users",
    ),
    path(
        "users/me/email/generate-code/",
        UserEndpoint.as_view({"post": "generate_email_verification_code"}),
        name="user-email-verify-code",
    ),
    path(
        "users/me/email/",
        UserEndpoint.as_view({"patch": "update_email"}),
        name="user-email-update",
    ),
    # Profile
    path("users/me/profile/", ProfileEndpoint.as_view(), name="accounts"),
    # End profile
    # Accounts
    path("users/me/accounts/", AccountEndpoint.as_view(), name="accounts"),
    path("users/me/accounts/<uuid:pk>/", AccountEndpoint.as_view(), name="accounts"),
    ## End Accounts
    # Google Calendar (personal connection, distinct from the /auth/google/ login flow)
    path("users/me/google-calendar/connect/", GoogleCalendarConnectEndpoint.as_view(), name="google-calendar-connect"),
    path("users/me/google-calendar/callback/", GoogleCalendarCallbackEndpoint.as_view(), name="google-calendar-callback"),
    path("users/me/google-calendar/status/", GoogleCalendarStatusEndpoint.as_view(), name="google-calendar-status"),
    path(
        "users/me/google-calendar/preferences/",
        GoogleCalendarPreferencesEndpoint.as_view(),
        name="google-calendar-preferences",
    ),
    path(
        "users/me/google-calendar/disconnect/",
        GoogleCalendarDisconnectEndpoint.as_view(),
        name="google-calendar-disconnect",
    ),
    path(
        "users/me/google-calendar/sync-now/",
        GoogleCalendarSyncNowEndpoint.as_view(),
        name="google-calendar-sync-now",
    ),
    path("users/me/google-calendar/events/", GoogleCalendarEventsEndpoint.as_view(), name="google-calendar-events"),
    ## End Google Calendar
    path(
        "users/me/instance-admin/",
        UserEndpoint.as_view({"get": "retrieve_instance_admin"}),
        name="users",
    ),
    path("users/me/onboard/", UpdateUserOnBoardedEndpoint.as_view(), name="user-onboard"),
    path(
        "users/me/tour-completed/",
        UpdateUserTourCompletedEndpoint.as_view(),
        name="user-tour",
    ),
    path("users/me/activities/", UserActivityEndpoint.as_view(), name="user-activities"),
    # user workspaces
    path("users/me/workspaces/", UserWorkSpacesEndpoint.as_view(), name="user-workspace"),
    # User Graphs
    path(
        "users/me/workspaces/<str:slug>/activity-graph/",
        UserActivityGraphEndpoint.as_view(),
        name="user-activity-graph",
    ),
    path(
        "users/me/workspaces/<str:slug>/issues-completed-graph/",
        UserIssueCompletedGraphEndpoint.as_view(),
        name="completed-graph",
    ),
    path(
        "users/me/workspaces/<str:slug>/dashboard/",
        UserWorkspaceDashboardEndpoint.as_view(),
        name="user-workspace-dashboard",
    ),
    ## End User Graph
]
