# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.authentication.provider.oauth.google_calendar import GoogleCalendarOAuthProvider


class GoogleAccountOAuthProvider(GoogleCalendarOAuthProvider):
    """Pespo: a conta Google da pessoa num consentimento só (agenda e Drive juntos), em vez de conectar cada
    serviço separado. Mesmo client OAuth (o app Interno das integrações); o callback grava as duas conexões
    (``GoogleCalendarConnection`` e ``GoogleDriveConnection``) com os mesmos tokens. Quem desmarcar um
    dos serviços na tela do Google fica só com o outro."""

    scope = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive openid email"
    callback_path = "/api/users/me/google/callback/"

    CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"
    DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
