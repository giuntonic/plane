# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.authentication.provider.oauth.google_calendar import GoogleCalendarOAuthProvider


class GoogleDriveOAuthProvider(GoogleCalendarOAuthProvider):
    """Personal, per-user Google Drive connection. Same OAuth client and
    token exchange as the Google Calendar connection — only the scope and
    the callback differ, and the grant is stored on its own row
    (GoogleDriveConnection) so either can be disconnected independently.

    The full `drive` scope is needed to browse the user's whole Drive from
    inside Plane, to download/export files into Plane attachments and to
    create new Docs/Sheets. It's a Google "restricted" scope: fine for an
    OAuth app of type *Internal* (Google Workspace), a public app would
    need Google's verification."""

    scope = "https://www.googleapis.com/auth/drive openid email"
    callback_path = "/api/users/me/google-drive/callback/"
