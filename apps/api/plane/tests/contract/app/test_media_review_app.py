# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the media review (Pespo): comments at a video timecode or an image point,
with drawings and replies, mirrored as regular work item comments (…/issues/<id>/media-review/…)."""

from unittest import mock

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    FileAsset,
    Issue,
    IssueComment,
    MediaReviewComment,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)

PEN = {"tool": "pen", "color": "#FF0000", "width": 0.004, "points": [[0.1, 0.2], [0.15, 0.25], [1.4, -0.2]]}


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Review Project", identifier="REV", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def issue(db, project, create_user):
    state = State.objects.create(name="Todo", group="unstarted", project=project, workspace=project.workspace)
    return Issue.objects.create(
        name="Peça", project=project, workspace=project.workspace, state=state, created_by=create_user
    )


def _asset(issue, name="peca.mp4", mime="video/mp4", **extra):
    return FileAsset.objects.create(
        asset=f"{issue.workspace_id}/{name}",
        attributes={"name": name, "type": mime, "size": 1000},
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        is_uploaded=True,
        **extra,
    )


@pytest.fixture
def video(db, issue):
    return _asset(issue)


def _member_client(workspace, project, role, email):
    user = User.objects.create(email=email, username=email.split("@")[0], display_name=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def _list_url(issue):
    return reverse(
        "project-issue-media-review-comments",
        kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id},
    )


def _detail_url(issue, pk):
    return reverse(
        "project-issue-media-review-comment-detail",
        kwargs={"slug": issue.workspace.slug, "project_id": issue.project_id, "issue_id": issue.id, "pk": pk},
    )


def _create(client, issue, expected=status.HTTP_201_CREATED, **data):
    response = client.post(_list_url(issue), data, format="json")
    assert response.status_code == expected, response.data
    return response.data


@pytest.mark.contract
class TestMediaReviewComments:
    def test_video_comment_with_drawing_and_mirror(self, session_client, issue, video, create_user):
        data = _create(session_client, issue, asset=str(video.id), timecode=74.4, text="Corta aqui", drawing=[PEN])

        assert data["timecode"] == 74.4
        assert data["x"] is None and data["y"] is None
        # coordenadas presas entre 0 e 1, cor em minúsculas
        assert data["drawing"][0]["points"][-1] == [1.0, 0.0]
        assert data["drawing"][0]["color"] == "#ff0000"
        assert data["created_by"] == create_user.id

        mirror = IssueComment.objects.get(pk=data["comment"])
        assert mirror.issue_id == issue.id
        assert mirror.actor_id == create_user.id
        assert mirror.comment_stripped == f"🎬 Marcação de {create_user.display_name} em 1:14: Corta aqui"

        listed = session_client.get(_list_url(issue))
        assert listed.status_code == status.HTTP_200_OK
        assert [item["id"] for item in listed.data] == [data["id"]]

    def test_image_pin_and_reply(self, session_client, issue, create_user):
        image = _asset(issue, name="arte.png", mime="image/png")
        pin = _create(session_client, issue, asset=str(image.id), x=12.34, y=56.7, text="Logo maior")
        assert IssueComment.objects.get(pk=pin["comment"]).comment_stripped.startswith(
            f"📍 Marcação de {create_user.display_name} em (12.3%, 56.7%): Logo maior"
        )

        # posição e desenho de uma resposta são ignorados; a resposta fica no anexo da marcação
        reply = _create(
            session_client, issue, parent=pin["id"], text="Feito", timecode=3, drawing=[PEN], asset=str(image.id)
        )
        assert reply["parent"] == pin["id"]
        assert reply["asset"] == image.id
        assert reply["timecode"] is None and reply["drawing"] == []
        assert IssueComment.objects.get(pk=reply["comment"]).comment_stripped == (
            f"💬 Resposta de {create_user.display_name} à marcação em (12.3%, 56.7%): Feito"
        )

        # responder a uma resposta responde à marcação de cima
        nested = _create(session_client, issue, parent=reply["id"], text="Valeu")
        assert nested["parent"] == pin["id"]

    def test_drawing_only_comment(self, session_client, issue, video):
        data = _create(session_client, issue, asset=str(video.id), timecode=0, drawing=[PEN])
        assert data["text"] == ""
        assert IssueComment.objects.get(pk=data["comment"]).comment_stripped.endswith(": (desenho)")

    @pytest.mark.parametrize(
        "payload",
        [
            {"text": "sem posição"},
            {"timecode": 5},  # sem texto nem desenho
            {"timecode": -1, "text": "x"},
            {"x": 50, "text": "falta o y"},
            {"x": 150, "y": 10, "text": "fora da imagem"},
            {"timecode": "abc", "text": "x"},
            {
                "timecode": 1,
                "text": "x",
                "drawing": [{"tool": "circle", "color": "#000000", "width": 0.004, "points": [[0, 0]]}],
            },
            {
                "timecode": 1,
                "text": "x",
                "drawing": [{"tool": "pen", "color": "red", "width": 0.004, "points": [[0, 0]]}],
            },
            {
                "timecode": 1,
                "text": "x",
                "drawing": [{"tool": "arrow", "color": "#000000", "width": 0.004, "points": [[0, 0]]}],
            },
            {
                "timecode": 1,
                "text": "x",
                "drawing": [{"tool": "pen", "color": "#000000", "width": 1, "points": [[0, 0]]}],
            },
            {"timecode": 1, "text": "x" * 5001},
        ],
    )
    def test_invalid_payloads(self, session_client, issue, video, payload):
        _create(session_client, issue, expected=status.HTTP_400_BAD_REQUEST, asset=str(video.id), **payload)
        assert not MediaReviewComment.objects.exists()
        assert not IssueComment.objects.exists()

    def test_asset_must_be_an_uploaded_attachment_of_the_issue(self, session_client, issue, project, create_user):
        other = Issue.objects.create(name="Outra", project=project, workspace=project.workspace, state=issue.state)
        foreign = _asset(other)
        pending = _asset(issue, is_deleted=False)
        pending.is_uploaded = False
        pending.save()
        deleted = _asset(issue)
        deleted.is_deleted = True
        deleted.save()
        for asset in (foreign, pending, deleted):
            _create(
                session_client, issue, expected=status.HTTP_400_BAD_REQUEST, asset=str(asset.id), timecode=1, text="x"
            )

    def test_deleted_attachment_hides_its_comments(self, session_client, issue, video):
        _create(session_client, issue, asset=str(video.id), timecode=1, text="x")
        video.is_deleted = True
        video.save()
        assert session_client.get(_list_url(issue)).data == []

    def test_edit_updates_mirror_and_only_author_edits(self, session_client, issue, video, workspace, project):
        data = _create(session_client, issue, asset=str(video.id), timecode=10, text="Antes")
        response = session_client.patch(_detail_url(issue, data["id"]), {"text": "Depois"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["text"] == "Depois"
        assert response.data["edited_at"] is not None
        mirror = IssueComment.objects.get(pk=data["comment"])
        assert mirror.comment_stripped.endswith("em 0:10: Depois")

        member, _ = _member_client(workspace, project, 15, "membro-rev@plane.so")
        response = member.patch(_detail_url(issue, data["id"]), {"text": "Outro"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_resolve_by_team_not_by_other_guest(self, session_client, issue, video, workspace, project):
        project.guest_view_all_features = True
        project.save()
        data = _create(session_client, issue, asset=str(video.id), timecode=10, text="Ajustar")

        guest, _ = _member_client(workspace, project, 5, "cliente-rev@plane.so")
        response = guest.patch(_detail_url(issue, data["id"]), {"resolved": True}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

        member, member_user = _member_client(workspace, project, 15, "membro-rev2@plane.so")
        response = member.patch(_detail_url(issue, data["id"]), {"resolved": True}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resolved_at"] is not None
        assert response.data["resolved_by"] == member_user.id

        response = member.patch(_detail_url(issue, data["id"]), {"resolved": False}, format="json")
        assert response.data["resolved_at"] is None and response.data["resolved_by"] is None

        reply = _create(session_client, issue, parent=data["id"], text="ok")
        response = session_client.patch(_detail_url(issue, reply["id"]), {"resolved": True}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_removes_replies_and_mirrors(self, session_client, issue, video, workspace, project):
        data = _create(session_client, issue, asset=str(video.id), timecode=10, text="Ajustar")
        reply = _create(session_client, issue, parent=data["id"], text="ok")

        member, _ = _member_client(workspace, project, 15, "membro-rev3@plane.so")
        assert member.delete(_detail_url(issue, data["id"])).status_code == status.HTTP_403_FORBIDDEN

        assert session_client.delete(_detail_url(issue, data["id"])).status_code == status.HTTP_204_NO_CONTENT
        assert not MediaReviewComment.objects.exists()
        assert not IssueComment.objects.filter(pk__in=[data["comment"], reply["comment"]]).exists()

    def test_guest_comments_only_on_own_issue_unless_project_shows_all(self, issue, video, workspace, project):
        guest, guest_user = _member_client(workspace, project, 5, "cliente-rev2@plane.so")
        _create(guest, issue, expected=status.HTTP_400_BAD_REQUEST, asset=str(video.id), timecode=1, text="x")

        project.guest_view_all_features = True
        project.save()
        data = _create(guest, issue, asset=str(video.id), timecode=1, text="Gostei")
        assert data["created_by"] == guest_user.id
        # o cliente pode apagar o que escreveu
        assert guest.delete(_detail_url(issue, data["id"])).status_code == status.HTTP_204_NO_CONTENT

    def test_other_project_cannot_reach_issue(self, issue, video, workspace, create_user):
        other = Project.objects.create(name="Outro", identifier="OUT", workspace=workspace, created_by=create_user)
        outsider = User.objects.create(email="fora-rev@plane.so", username="fora_rev")
        WorkspaceMember.objects.create(workspace=workspace, member=outsider, role=15)
        ProjectMember.objects.create(project=other, member=outsider, role=20, is_active=True)
        client = APIClient()
        client.force_authenticate(user=outsider)
        url = reverse(
            "project-issue-media-review-comments",
            kwargs={"slug": workspace.slug, "project_id": other.id, "issue_id": issue.id},
        )
        assert client.get(url).status_code == status.HTTP_404_NOT_FOUND
        response = client.post(url, {"asset": str(video.id), "timecode": 1, "text": "x"}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_activity_and_webhook_sent_after_commit(
        self, session_client, issue, video, django_capture_on_commit_callbacks
    ):
        with (
            mock.patch("plane.app.views.issue.media_review.issue_activity") as activity,
            mock.patch("plane.app.views.issue.media_review.model_activity") as webhook,
            django_capture_on_commit_callbacks(execute=True),
        ):
            _create(session_client, issue, asset=str(video.id), timecode=1, text="x")
        assert activity.delay.call_args.kwargs["type"] == "comment.activity.created"
        assert webhook.delay.call_args.kwargs["model_name"] == "issue_comment"
