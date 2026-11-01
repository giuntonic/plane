# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: conta Google num consentimento só (agenda e Drive juntos), conectada numa janela que avisa a tela de
origem, e desconexão das duas de uma vez (users/me/google/…)."""

from unittest import mock

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import GoogleCalendarConnection, GoogleDriveConnection

VIEWS = "plane.app.views.user.google_account"
GCAL = "plane.utils.google_calendar"
CALENDAR = "https://www.googleapis.com/auth/calendar"
DRIVE = "https://www.googleapis.com/auth/drive"


def _client(user, **session_values):
    client = APIClient()
    client.force_login(user)
    session = client.session
    for key, value in session_values.items():
        session[key] = value
    session.save()
    return client


def _provider(scope):
    provider = mock.Mock()
    provider.CALENDAR_SCOPE = CALENDAR
    provider.DRIVE_SCOPE = DRIVE
    provider.scope = f"{CALENDAR} {DRIVE} openid email"
    provider.exchange_code_for_tokens.return_value = {
        "access_token": "acc",
        "refresh_token": "ref",
        "expires_in": 3600,
        "scope": scope,
    }
    provider.fetch_google_email.return_value = "pessoa@pespo.com.br"
    return provider


def _callback(client, provider):
    with (
        mock.patch(f"{VIEWS}.GoogleAccountOAuthProvider", return_value=provider),
        mock.patch(f"{GCAL}.create_dedicated_calendar", return_value="cal-plane"),
        mock.patch(f"{VIEWS}.sync_user_calendar") as sync_task,
    ):
        response = client.get(reverse("google-account-callback"), {"code": "c", "state": "st"})
    return response, sync_task


@pytest.mark.contract
class TestGoogleAccount:
    @pytest.mark.django_db
    def test_one_consent_connects_calendar_and_drive_in_a_popup(self, create_user):
        client = _client(
            create_user,
            google_account_state="st",
            google_account_next="/pespo/browse/MKT-1/",
            google_account_popup=True,
        )
        response, sync_task = _callback(client, _provider(f"openid email {CALENDAR} {DRIVE}"))

        assert response.status_code == status.HTTP_200_OK
        page = response.content.decode()
        assert "postMessage" in page and '"connected"' in page
        assert "/pespo/browse/MKT-1/?google=connected" in page
        calendar = GoogleCalendarConnection.objects.get(user=create_user)
        drive = GoogleDriveConnection.objects.get(user=create_user)
        assert calendar.refresh_token == drive.refresh_token == "ref"
        assert calendar.plane_calendar_id == "cal-plane"
        sync_task.delay.assert_called_once_with(str(calendar.id))

        status_response = client.get(reverse("google-account-status"))
        assert status_response.data["calendar"] is True
        assert status_response.data["drive"] is True
        assert status_response.data["google_email"] == "pessoa@pespo.com.br"

    @pytest.mark.django_db
    def test_unchecked_service_is_left_out_and_redirect_without_popup(self, create_user):
        client = _client(create_user, google_account_state="st", google_account_next="/pespo/pages/")
        response, sync_task = _callback(client, _provider(f"openid email {DRIVE}"))

        assert response.status_code == status.HTTP_302_FOUND
        assert response["Location"].endswith("/pespo/pages/?google=connected")
        assert GoogleDriveConnection.objects.filter(user=create_user).exists()
        assert not GoogleCalendarConnection.objects.filter(user=create_user).exists()
        sync_task.delay.assert_not_called()

    @pytest.mark.django_db
    def test_state_mismatch_and_unsafe_next(self, create_user):
        client = _client(create_user, google_account_state="st")
        response, _ = _callback(client, _provider(f"{CALENDAR} {DRIVE}"))
        # o estado já foi consumido: uma segunda chamada não passa
        response, _ = _callback(client, _provider(f"{CALENDAR} {DRIVE}"))
        assert response["Location"].endswith("/settings/profile/google/?google=error")

        client.get(reverse("google-account-connect"), {"next": "https://evil.example/", "popup": "1"})
        assert client.session.get("google_account_next") is None

    @pytest.mark.django_db
    def test_disconnect_revokes_the_shared_grant_once(self, create_user):
        client = _client(create_user, google_account_state="st")
        _callback(client, _provider(f"{CALENDAR} {DRIVE}"))
        with (
            mock.patch(f"{GCAL}.revoke_token") as revoke,
            mock.patch(f"{VIEWS}.teardown_connection") as teardown,
        ):
            response = client.delete(reverse("google-account-disconnect"))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert revoke.call_count == 1
        teardown.assert_called_once()
        assert not GoogleCalendarConnection.all_objects.filter(user=create_user).exists()
        assert not GoogleDriveConnection.all_objects.filter(user=create_user).exists()

    @pytest.mark.django_db
    def test_disconnecting_one_service_keeps_the_other_working(self, create_user):
        client = _client(create_user, google_account_state="st")
        _callback(client, _provider(f"{CALENDAR} {DRIVE}"))
        with (
            mock.patch(f"{GCAL}.revoke_token") as revoke_calendar,
            mock.patch("plane.utils.google_drive.revoke_token") as revoke_drive,
            mock.patch("plane.app.views.user.google_calendar.teardown_connection"),
        ):
            client.delete(reverse("google-calendar-disconnect"))
            assert not revoke_calendar.called  # o Drive usa a mesma concessão
            client.delete(reverse("google-drive-disconnect"))
            assert revoke_drive.called  # agora é a última
