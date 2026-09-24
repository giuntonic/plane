# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
from urllib.parse import urlencode

# Module imports
from plane.authentication.adapter.oauth import OauthAdapter
from plane.license.utils.instance_value import get_configuration_value
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)


class GoogleCalendarOAuthProvider(OauthAdapter):
    """Personal, per-user Google Calendar connection — distinct from
    GoogleOAuthProvider (login/signup): different scope, different
    redirect target, and it never logs a user in or creates an Account
    row. The caller is always an already-authenticated Plane user."""

    token_url = "https://oauth2.googleapis.com/token"
    userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
    scope = "https://www.googleapis.com/auth/calendar openid email"
    provider = "google"

    def __init__(self, request, code=None, state=None):
        (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) = get_configuration_value(
            [
                {"key": "GOOGLE_CLIENT_ID", "default": os.environ.get("GOOGLE_CLIENT_ID")},
                {"key": "GOOGLE_CLIENT_SECRET", "default": os.environ.get("GOOGLE_CLIENT_SECRET")},
            ]
        )

        if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["GOOGLE_NOT_CONFIGURED"],
                error_message="GOOGLE_NOT_CONFIGURED",
            )

        redirect_uri = (
            f"""{"https" if request.is_secure() else "http"}://{request.get_host()}"""
            "/api/users/me/google-calendar/callback/"
        )
        url_params = {
            "client_id": GOOGLE_CLIENT_ID,
            "scope": self.scope,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(url_params)}"

        super().__init__(
            request,
            self.provider,
            GOOGLE_CLIENT_ID,
            self.scope,
            redirect_uri,
            auth_url,
            self.token_url,
            self.userinfo_url,
            GOOGLE_CLIENT_SECRET,
            code,
        )

    def exchange_code_for_tokens(self):
        """Exchange the authorization code for access/refresh tokens.
        Sets self.token_data and returns it — does not touch Account or
        log the user in, unlike OauthAdapter.authenticate()."""
        data = {
            "code": self.code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        token_response = self.get_user_token(data=data)
        self.set_token_data(token_response)
        return token_response

    def fetch_google_email(self):
        """Requires exchange_code_for_tokens() to have run first."""
        return self.get_user_response().get("email", "")
