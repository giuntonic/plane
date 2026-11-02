# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: funções e serviços da equipe e o atalho "Serviços"."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import TeamRole, User, WorkspaceMember


@pytest.fixture
def designer(workspace):
    user = User.objects.create(email="bia@pespo.com.br", username="bia")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.mark.contract
@pytest.mark.django_db
class TestTeamCatalog:
    def test_roles_decide_which_services_each_person_sees(self, session_client, workspace, designer):
        url = reverse("workspace-team-services", kwargs={"slug": workspace.slug})
        n8n = session_client.post(url, {"name": "n8n", "url": "https://n8n.pespo.com.br", "icon": "🔁"}, format="json")
        draw = session_client.post(url, {"name": "Excalidraw", "url": "https://excalidraw.pespo.com.br"}, format="json")
        assert n8n.status_code == status.HTTP_201_CREATED and draw.status_code == status.HTTP_201_CREATED
        bad = session_client.post(url, {"name": "Sem endereço", "url": "javascript:alert(1)"}, format="json")
        assert bad.data["code"] == "INVALID_URL"

        roles_url = reverse("workspace-team-roles", kwargs={"slug": workspace.slug})
        response = session_client.post(
            roles_url,
            {"name": "Criação", "service_ids": [draw.data["id"]], "member_ids": [str(designer.id)]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["member_ids"] == [str(designer.id)]
        again = session_client.post(roles_url, {"name": "criação"}, format="json")
        assert again.data["code"] == "ROLE_NAME_TAKEN"

        mine = reverse("workspace-team-services-mine", kwargs={"slug": workspace.slug})
        api = APIClient()
        api.force_authenticate(user=designer)
        assert [s["name"] for s in api.get(mine).data] == ["Excalidraw"]
        # o admin vê todos
        assert {s["name"] for s in session_client.get(mine).data} == {"n8n", "Excalidraw"}
        # só admins mexem no catálogo
        catalog = reverse("workspace-team-catalog", kwargs={"slug": workspace.slug})
        assert api.get(catalog).status_code == status.HTTP_403_FORBIDDEN
        assert len(session_client.get(catalog).data["roles"]) == 1

        role_url = reverse("workspace-team-role", kwargs={"slug": workspace.slug, "pk": response.data["id"]})
        session_client.patch(role_url, {"service_ids": [n8n.data["id"], draw.data["id"]]}, format="json")
        assert {s["name"] for s in api.get(mine).data} == {"n8n", "Excalidraw"}
        session_client.delete(role_url)
        assert not TeamRole.objects.exists()
        assert api.get(mine).data == []
