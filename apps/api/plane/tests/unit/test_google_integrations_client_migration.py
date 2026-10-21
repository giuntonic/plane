# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: license.0007 copies the current Google OAuth client to the integrations keys."""

import importlib

import pytest
from django.apps import apps

from plane.license.models import InstanceConfiguration

migration = importlib.import_module("plane.license.migrations.0007_google_integrations_client")


def _set(key, value, is_encrypted=False):
    InstanceConfiguration.objects.update_or_create(
        key=key, defaults={"value": value, "category": "GOOGLE", "is_encrypted": is_encrypted}
    )


def _get(key):
    return InstanceConfiguration.objects.filter(key=key).first()


@pytest.mark.unit
@pytest.mark.django_db
class TestCopyLoginClientToIntegrations:
    def test_copies_id_and_encrypted_secret_as_is(self):
        _set("GOOGLE_CLIENT_ID", "internal-id")
        _set("GOOGLE_CLIENT_SECRET", "ciphertext", is_encrypted=True)

        migration.copy_login_client_to_integrations(apps, None)

        assert _get("GOOGLE_INTEGRATIONS_CLIENT_ID").value == "internal-id"
        secret = _get("GOOGLE_INTEGRATIONS_CLIENT_SECRET")
        assert (secret.value, secret.is_encrypted) == ("ciphertext", True)

    def test_keeps_integration_values_already_set(self):
        _set("GOOGLE_CLIENT_ID", "login-id")
        _set("GOOGLE_INTEGRATIONS_CLIENT_ID", "already-set")

        migration.copy_login_client_to_integrations(apps, None)

        assert _get("GOOGLE_INTEGRATIONS_CLIENT_ID").value == "already-set"

    def test_fills_an_empty_row_created_by_configure_instance(self):
        _set("GOOGLE_CLIENT_ID", "internal-id")
        _set("GOOGLE_INTEGRATIONS_CLIENT_ID", None)

        migration.copy_login_client_to_integrations(apps, None)

        assert _get("GOOGLE_INTEGRATIONS_CLIENT_ID").value == "internal-id"

    def test_nothing_to_copy(self):
        migration.copy_login_client_to_integrations(apps, None)

        assert _get("GOOGLE_INTEGRATIONS_CLIENT_ID") is None
