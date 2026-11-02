# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Pespo: Acervo da peça no Nextcloud: links de envio e de entrega no item (equipe e cliente), pasta do projeto
nas configurações, a pasta que nasce com o projeto, o aviso de material recebido e o comando do deploy. O
Nextcloud é um falso em memória (``FakeNextcloud``), com as mesmas respostas do cliente de verdade."""

from datetime import datetime, timedelta, timezone as dt_timezone
from io import StringIO
from unittest import mock

import pytest
from django.core.management import call_command
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.app.serializers import ProjectSerializer
from plane.bgtasks.acervo_task import check_received_material, create_project_folder
from plane.db.models import (
    Issue,
    IssueAcervoFolder,
    IssueAcervoLink,
    IssueAssignee,
    IssueComment,
    IssueSubscriber,
    Notification,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.utils import acervo
from plane.utils.nextcloud import PERMISSION_CREATE, PERMISSION_READ, NextcloudError, NextcloudNotFound, split_path
from plane.utils.team_only_comments import ACERVO_TEAM_SOURCE, hide_team_only_comments


class FakeNextcloud:
    """Nextcloud em memória: pastas, arquivos e links públicos."""

    def __init__(self):
        self.folders = {"Acervo"}
        self.files = {}
        self.shares = {}
        self.counter = 100
        self.down = False

    def _next(self):
        self.counter += 1
        return str(self.counter)

    def _check(self):
        if self.down:
            raise NextcloudError("Nextcloud fora do ar")

    def make_folder(self, path):
        self._check()
        parts, created = split_path(path), False
        for index in range(1, len(parts) + 1):
            prefix = "/".join(parts[:index])
            if prefix not in self.folders:
                self.folders.add(prefix)
                created = True
        return created

    def add_file(self, path, size=1024):
        parent = "/".join(split_path(path)[:-1])
        assert parent in self.folders, parent
        self.files[path] = {"size": size, "file_id": self._next()}

    def list_folder(self, path):
        self._check()
        path = "/".join(split_path(path))
        if path not in self.folders:
            raise NextcloudNotFound(path)

        def entry(name, is_folder, size=0, file_id=""):
            return {
                "href": f"/{name}",
                "name": name,
                "is_folder": is_folder,
                "size": size,
                "modified": datetime(2026, 11, 2, 12, 0, tzinfo=dt_timezone.utc),
                "etag": "e",
                "file_id": file_id,
            }

        children = [entry(f.rsplit("/", 1)[-1], True) for f in sorted(self.folders) if f.rsplit("/", 1)[0] == path]
        children += [
            entry(f.rsplit("/", 1)[-1], False, data["size"], data["file_id"])
            for f, data in sorted(self.files.items())
            if f.rsplit("/", 1)[0] == path
        ]
        return entry(path.rsplit("/", 1)[-1], True), children

    def create_link(self, path, permissions, expires_on, label=""):
        self._check()
        share_id = self._next()
        self.shares[share_id] = {
            "path": "/".join(split_path(path)),
            "permissions": permissions,
            "expires_on": expires_on,
            "label": label,
            "note": "",
            "token": f"tok{share_id}",
        }
        return {"id": share_id, "token": f"tok{share_id}"}

    def update_link(self, share_id, expires_on=None, note=None):
        self._check()
        if share_id not in self.shares:
            raise NextcloudNotFound(share_id)
        if expires_on is not None:
            self.shares[share_id]["expires_on"] = expires_on
        if note is not None:
            self.shares[share_id]["note"] = note
        return {}

    def delete_link(self, share_id):
        self._check()
        self.shares.pop(share_id, None)


@pytest.fixture
def nextcloud(settings):
    settings.NEXTCLOUD_URL = "http://nextcloud"
    settings.NEXTCLOUD_PUBLIC_URL = "https://arquivos.pespo.com.br"
    settings.NEXTCLOUD_USER = "pespo-hub"
    settings.NEXTCLOUD_APP_PASSWORD = "senha-de-app"
    settings.NEXTCLOUD_ROOT = "Acervo/Clientes"
    settings.NEXTCLOUD_LINK_DAYS = 30
    fake = FakeNextcloud()
    with mock.patch("plane.utils.acervo.get_client", return_value=fake):
        yield fake


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Padaria Bom Dia", identifier="PAD", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def state(db, project):
    return State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)


@pytest.fixture
def issue(db, project, state):
    return Issue.objects.create(name="Post Natal", project=project, workspace=project.workspace, state=state)


def _member(workspace, project, role, email):
    user = User.objects.create(email=email, username=email.split("@")[0], display_name=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def _url(name, issue, **kwargs):
    return reverse(
        name, kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id, **kwargs}
    )


def _project_url(name, project):
    return reverse(name, kwargs={"slug": project.workspace.slug, "project_id": project.id})


def _today(project):
    return acervo.today_for(project)


@pytest.mark.contract
class TestTeamLinks:
    def test_upload_link_creates_the_folders_and_an_upload_only_share(self, session_client, issue, nextcloud):
        response = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data

        base = "Acervo/Clientes/Padaria Bom Dia/Post Natal"
        assert {f"{base}/Recebido", f"{base}/Entrega"} <= nextcloud.folders
        share = nextcloud.shares[response.data["url"].rsplit("/tok", 1)[-1]]
        assert share["path"] == f"{base}/Recebido"
        assert share["permissions"] == PERMISSION_CREATE
        assert share["expires_on"] == _today(issue.project) + timedelta(days=30)
        assert "Post Natal" in share["note"]
        assert response.data["url"].startswith("https://arquivos.pespo.com.br/s/tok")
        assert response.data["kind"] == "upload" and response.data["is_active"] is True
        assert response.data["files_url"].endswith("/Recebido")
        issue.project.refresh_from_db()
        assert issue.project.acervo_folder == "Acervo/Clientes/Padaria Bom Dia"

    def test_asking_again_returns_the_active_link(self, session_client, issue, nextcloud):
        first = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        again = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert again.status_code == status.HTTP_200_OK
        assert again.data["id"] == first.data["id"]
        assert len(nextcloud.shares) == 1

    def test_delivery_link_is_read_only(self, session_client, issue, nextcloud):
        response = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        share = next(iter(nextcloud.shares.values()))
        assert share["permissions"] == PERMISSION_READ
        assert share["path"].endswith("/Post Natal/Entrega")

    def test_invalid_kind(self, session_client, issue, nextcloud):
        response = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "edit"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_same_name_gets_a_numbered_folder_and_names_are_cleaned(self, session_client, issue, project, state, nextcloud):
        twin = Issue.objects.create(name="Post Natal", project=project, workspace=project.workspace, state=state)
        odd = Issue.objects.create(name="Reels 1/2: estreia?", project=project, workspace=project.workspace, state=state)
        for item in (issue, twin, odd):
            session_client.post(_url("project-issue-acervo-folder", item))
        paths = dict(IssueAcervoFolder.objects.values_list("issue_id", "path"))
        assert paths[issue.id] == "Acervo/Clientes/Padaria Bom Dia/Post Natal"
        assert paths[twin.id] == "Acervo/Clientes/Padaria Bom Dia/Post Natal (2)"
        assert paths[odd.id] == "Acervo/Clientes/Padaria Bom Dia/Reels 1-2- estreia-"

    def test_get_lists_links_and_files(self, session_client, issue, nextcloud):
        session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        session_client.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json")
        base = "Acervo/Clientes/Padaria Bom Dia/Post Natal"
        nextcloud.add_file(f"{base}/Recebido/bruto.mov", size=2048)
        nextcloud.add_file(f"{base}/Recebido/.DS_Store")
        nextcloud.add_file(f"{base}/Entrega/final.mp4")

        response = session_client.get(_url("project-issue-acervo", issue))
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["enabled"] is True and data["is_team"] is True and data["unavailable"] is False
        assert [link["kind"] for link in data["links"]] == ["upload", "delivery"]
        assert [f["name"] for f in data["received"]] == ["bruto.mov"]
        assert data["received"][0]["size"] == 2048
        assert [f["name"] for f in data["delivery"]] == ["final.mp4"]
        assert data["folder"]["files_url"] == (
            "https://arquivos.pespo.com.br/apps/files/files?dir=/Acervo/Clientes/Padaria%20Bom%20Dia/Post%20Natal"
        )

    def test_get_without_folder_calls_nothing(self, session_client, issue, nextcloud):
        nextcloud.down = True
        response = session_client.get(_url("project-issue-acervo", issue))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["links"] == [] and response.data["folder"] is None

    def test_renew_and_change_the_date(self, session_client, issue, nextcloud):
        link = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json").data
        today = _today(issue.project)
        IssueAcervoLink.objects.filter(pk=link["id"]).update(expires_on=today + timedelta(days=3))

        renewed = session_client.patch(
            _url("project-issue-acervo-link-detail", issue, pk=link["id"]), {"renew": True}, format="json"
        )
        assert renewed.status_code == status.HTTP_200_OK
        assert renewed.data["expires_on"] == (today + timedelta(days=30)).isoformat()

        bad = session_client.patch(
            _url("project-issue-acervo-link-detail", issue, pk=link["id"]), {"expires_on": str(today)}, format="json"
        )
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

        chosen = today + timedelta(days=90)
        changed = session_client.patch(
            _url("project-issue-acervo-link-detail", issue, pk=link["id"]), {"expires_on": str(chosen)}, format="json"
        )
        assert changed.status_code == status.HTTP_200_OK
        assert nextcloud.shares[IssueAcervoLink.objects.get(pk=link["id"]).share_id]["expires_on"] == chosen

    def test_renewing_a_link_the_nextcloud_already_removed_creates_a_new_one(self, session_client, issue, nextcloud):
        link = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json").data
        IssueAcervoLink.objects.filter(pk=link["id"]).update(expires_on=_today(issue.project) - timedelta(days=2))
        nextcloud.shares.clear()  # o Nextcloud apaga os links vencidos

        # vencido continua aparecendo para a equipe, para renovar
        listed = session_client.get(_url("project-issue-acervo", issue)).data["links"]
        assert listed[0]["is_active"] is False

        renewed = session_client.patch(
            _url("project-issue-acervo-link-detail", issue, pk=link["id"]), {"renew": True}, format="json"
        )
        assert renewed.status_code == status.HTTP_200_OK
        assert renewed.data["is_active"] is True
        assert renewed.data["url"] != link["url"]
        assert next(iter(nextcloud.shares.values()))["permissions"] == PERMISSION_CREATE

    def test_revoke(self, session_client, issue, nextcloud):
        link = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json").data
        response = session_client.delete(_url("project-issue-acervo-link-detail", issue, pk=link["id"]))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert nextcloud.shares == {}
        assert session_client.get(_url("project-issue-acervo", issue)).data["links"] == []
        again = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert again.status_code == status.HTTP_201_CREATED and again.data["id"] != link["id"]

    def test_nextcloud_down(self, session_client, issue, nextcloud):
        session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        nextcloud.down = True
        response = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["error"] == "ACERVO_UNAVAILABLE"
        listed = session_client.get(_url("project-issue-acervo", issue))
        assert listed.status_code == status.HTTP_200_OK
        assert listed.data["unavailable"] is True and len(listed.data["links"]) == 1

    def test_disabled_without_the_settings(self, session_client, issue, settings):
        settings.NEXTCLOUD_URL = ""
        assert session_client.get(_url("project-issue-acervo", issue)).data["enabled"] is False
        response = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "ACERVO_DISABLED"


@pytest.mark.contract
class TestClient:
    """O cliente entra no Hub como convidado do projeto."""

    def test_guest_sees_active_links_and_creates_only_the_upload_one(
        self, session_client, issue, workspace, project, nextcloud
    ):
        guest, user = _member(workspace, project, 5, "cliente@padaria.com")
        project.guest_view_all_features = True
        project.save()

        delivery = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json")
        IssueAcervoLink.objects.filter(pk=delivery.data["id"]).update(
            expires_on=_today(project) - timedelta(days=1)
        )
        assert guest.get(_url("project-issue-acervo", issue)).data["links"] == []

        forbidden = guest.post(_url("project-issue-acervo-links", issue), {"kind": "delivery"}, format="json")
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN

        upload = guest.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert upload.status_code == status.HTTP_201_CREATED
        assert "files_url" not in upload.data

        data = guest.get(_url("project-issue-acervo", issue)).data
        assert data["is_team"] is False and data["folder"] is None
        assert [link["kind"] for link in data["links"]] == ["upload"]
        assert "files_url" not in data["links"][0]

        link_id = upload.data["id"]
        assert guest.patch(
            _url("project-issue-acervo-link-detail", issue, pk=link_id), {"renew": True}, format="json"
        ).status_code == status.HTTP_403_FORBIDDEN
        assert guest.delete(_url("project-issue-acervo-link-detail", issue, pk=link_id)).status_code == (
            status.HTTP_403_FORBIDDEN
        )
        assert guest.post(_url("project-issue-acervo-folder", issue)).status_code == status.HTTP_403_FORBIDDEN

    def test_guest_without_view_all_reaches_only_own_items(self, issue, workspace, project, state, nextcloud):
        guest, user = _member(workspace, project, 5, "cliente@padaria.com")
        assert guest.get(_url("project-issue-acervo", issue)).status_code == status.HTTP_404_NOT_FOUND
        response = guest.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

        own = Issue.objects.create(name="Pedido", project=project, workspace=project.workspace, state=state)
        Issue.objects.filter(pk=own.pk).update(created_by=user)
        assert guest.get(_url("project-issue-acervo", own)).status_code == status.HTTP_200_OK
        created = guest.post(_url("project-issue-acervo-links", own), {"kind": "upload"}, format="json")
        assert created.status_code == status.HTTP_201_CREATED


@pytest.mark.contract
class TestProjectFolder:
    def test_new_project_schedules_its_folder(self, db, workspace, create_user, nextcloud, django_capture_on_commit_callbacks):
        with mock.patch("plane.bgtasks.acervo_task.create_project_folder.delay") as delay:
            with django_capture_on_commit_callbacks(execute=True):
                project = Project.objects.create(name="Café Central", identifier="CAF", workspace=workspace)
        delay.assert_called_once_with(str(project.id))

        create_project_folder.apply(args=[str(project.id)]).get()
        project.refresh_from_db()
        assert project.acervo_folder == "Acervo/Clientes/Café Central"
        assert "Acervo/Clientes/Café Central" in nextcloud.folders

    def test_no_folder_task_without_the_settings(self, db, workspace, settings, django_capture_on_commit_callbacks):
        settings.NEXTCLOUD_URL = ""
        with mock.patch("plane.bgtasks.acervo_task.create_project_folder.delay") as delay:
            with django_capture_on_commit_callbacks(execute=True):
                Project.objects.create(name="Café Central", identifier="CAF", workspace=workspace)
        delay.assert_not_called()

    def test_settings_page(self, session_client, project, nextcloud):
        data = session_client.get(_project_url("project-acervo", project)).data
        assert data["enabled"] is True and data["folder"] == ""
        assert data["default_folder"] == "Acervo/Clientes/Padaria Bom Dia"

        created = session_client.post(_project_url("project-acervo", project), {}, format="json")
        assert created.status_code == status.HTTP_200_OK
        assert created.data["folder"] == "Acervo/Clientes/Padaria Bom Dia"
        assert created.data["files_url"].endswith("Padaria%20Bom%20Dia")

        moved = session_client.post(
            _project_url("project-acervo", project), {"folder": "Acervo/Outros/Padaria"}, format="json"
        )
        assert moved.data["folder"] == "Acervo/Outros/Padaria"
        assert "Acervo/Outros/Padaria" in nextcloud.folders

        outside = session_client.post(_project_url("project-acervo", project), {"folder": "Fotos"}, format="json")
        assert outside.status_code == status.HTTP_400_BAD_REQUEST

    def test_only_admins_change_the_folder(self, workspace, project, nextcloud):
        member, _ = _member(workspace, project, 15, "equipe@pespo.com.br")
        assert member.get(_project_url("project-acervo", project)).status_code == status.HTTP_200_OK
        response = member.post(_project_url("project-acervo", project), {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_browse_and_new_folder(self, session_client, project, nextcloud):
        nextcloud.make_folder("Acervo/Clientes/Zeta")
        nextcloud.make_folder("Acervo/Clientes/alfa")
        listed = session_client.get(_project_url("project-acervo-browse", project))
        assert listed.status_code == status.HTTP_200_OK
        assert listed.data["path"] == "Acervo/Clientes" and listed.data["parent"] == "Acervo"
        assert [f["name"] for f in listed.data["folders"]] == ["alfa", "Zeta"]

        created = session_client.post(
            _project_url("project-acervo-browse", project), {"path": "Acervo/Clientes", "name": "Nova/Pasta"}, format="json"
        )
        assert created.status_code == status.HTTP_201_CREATED
        assert created.data["path"] == "Acervo/Clientes/Nova-Pasta"

        top = session_client.get(_project_url("project-acervo-browse", project), {"path": "Acervo"})
        assert top.data["parent"] is None and top.data["selectable"] is False
        bad = session_client.get(_project_url("project-acervo-browse", project), {"path": "Acervo/../etc"})
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

    def test_the_folder_is_not_writable_through_the_project(self, project):
        serializer = ProjectSerializer(
            project, data={"acervo_folder": "Acervo/Outro"}, partial=True, context={"workspace_id": project.workspace_id}
        )
        assert serializer.is_valid(), serializer.errors
        assert "acervo_folder" not in serializer.validated_data


@pytest.mark.contract
class TestReceivedMaterial:
    def _setup(self, session_client, issue, workspace, project, nextcloud):
        member, member_user = _member(workspace, project, 15, "equipe@pespo.com.br")
        guest, guest_user = _member(workspace, project, 5, "cliente@padaria.com")
        IssueAssignee.objects.create(issue=issue, assignee=member_user, project=project)
        IssueSubscriber.objects.create(issue=issue, subscriber=guest_user, project=project)
        session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        return member_user, guest_user

    def test_new_files_notify_the_team_once(self, session_client, issue, workspace, project, nextcloud, create_user):
        member_user, guest_user = self._setup(session_client, issue, workspace, project, nextcloud)
        IssueSubscriber.objects.create(issue=issue, subscriber=create_user, project=project)
        base = "Acervo/Clientes/Padaria Bom Dia/Post Natal/Recebido"
        nextcloud.add_file(f"{base}/<bruto>.mov", size=3 * 1024**3)
        nextcloud.add_file(f"{base}/roteiro.pdf", size=1024)
        nextcloud.add_file(f"{base}/video.mov.ocTransferId9.part")

        assert check_received_material() == 1
        comment = IssueComment.objects.get(issue=issue)
        assert comment.external_source == ACERVO_TEAM_SOURCE
        assert comment.actor.is_bot and comment.actor.display_name == "Arquivos"
        assert "2 arquivos novos" in comment.comment_html and "3,0 GB" in comment.comment_html
        assert "&lt;bruto&gt;.mov" in comment.comment_html and ".part" not in comment.comment_html

        notifications = {n.receiver_id: n for n in Notification.objects.filter(entity_identifier=issue.id)}
        assert set(notifications) == {member_user.id, create_user.id}  # o cliente que segue o item não recebe
        assert notifications[member_user.id].sender == "in_app:issue_activities:assigned"
        assert notifications[create_user.id].sender == "in_app:issue_activities:subscribed"
        assert notifications[member_user.id].data["issue_activity"]["field"] == "comment"

        # o cliente não vê o aviso
        assert not hide_team_only_comments(IssueComment.objects.filter(issue=issue), guest_user, project.id).exists()

        assert check_received_material() == 0
        assert IssueComment.objects.filter(issue=issue).count() == 1

    def test_files_already_there_do_not_notify(self, session_client, issue, project, state, nextcloud):
        other = Issue.objects.create(name="Reels", project=project, workspace=project.workspace, state=state)
        base = "Acervo/Clientes/Padaria Bom Dia/Reels/Recebido"
        nextcloud.make_folder(base)
        nextcloud.add_file(f"{base}/antigo.mov")
        session_client.post(_url("project-issue-acervo-links", other), {"kind": "upload"}, format="json")
        assert check_received_material() == 0
        nextcloud.add_file(f"{base}/novo.mov")
        assert check_received_material() == 1
        assert "novo.mov" in IssueComment.objects.get(issue=other).comment_html
        assert "antigo.mov" not in IssueComment.objects.get(issue=other).comment_html

    def test_revoked_links_are_not_checked(self, session_client, issue, nextcloud):
        link = session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json").data
        session_client.delete(_url("project-issue-acervo-link-detail", issue, pk=link["id"]))
        nextcloud.add_file("Acervo/Clientes/Padaria Bom Dia/Post Natal/Recebido/tarde.mov")
        assert check_received_material() == 0
        assert not IssueComment.objects.filter(issue=issue).exists()

    def test_nextcloud_down_does_not_break_the_beat(self, session_client, issue, nextcloud):
        session_client.post(_url("project-issue-acervo-links", issue), {"kind": "upload"}, format="json")
        nextcloud.down = True
        assert check_received_material() == 0


@pytest.mark.contract
class TestCreateFoldersCommand:
    def test_only_client_projects_by_default(self, project, workspace, nextcloud):
        internal = Project.objects.create(name="Interno", identifier="INT", workspace=workspace)
        with mock.patch(
            "plane.db.management.commands.acervo_criar_pastas.client_project_ids", return_value=[str(project.id)]
        ):
            out = StringIO()
            call_command("acervo_criar_pastas", "--simular", stdout=out)
            assert "Padaria Bom Dia: Acervo/Clientes/Padaria Bom Dia (nova)" in out.getvalue()
            assert "Interno" not in out.getvalue()
            assert "Acervo/Clientes/Padaria Bom Dia" not in nextcloud.folders

            call_command("acervo_criar_pastas", stdout=StringIO())
        project.refresh_from_db()
        internal.refresh_from_db()
        assert project.acervo_folder == "Acervo/Clientes/Padaria Bom Dia"
        assert "Acervo/Clientes/Padaria Bom Dia" in nextcloud.folders
        assert internal.acervo_folder == ""
