# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import html
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.http import HttpResponseRedirect
from django.utils import timezone

# Third Party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers.media_review import MAX_TEXT, MediaReviewCommentSerializer, clean_drawing
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.media_review_task import is_video_asset, queue_media_processing
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    FileAsset,
    Issue,
    IssueComment,
    MediaRendition,
    MediaReviewComment,
    Project,
    ProjectMember,
)
from plane.settings.storage import S3Storage
from plane.utils.host import base_host

# Pespo: revisão de peça (vídeo ou imagem) no item de trabalho, no lugar do Clapshot.


def format_timecode(seconds):
    """Mesmo formato da Marcação da Peça e do portal: m:ss ou h:mm:ss."""
    total = max(0, int(round(seconds or 0)))
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def position_label(review):
    if review.timecode is not None:
        return format_timecode(review.timecode)
    return f"({review.x:.1f}%, {review.y:.1f}%)"


def mirror_html(review, user):
    """Texto da cópia no feed de comentários. As marcações seguem o formato antigo, que o portal do
    cliente e a Marcação da Peça liam; as respostas citam a marcação de cima."""
    who = html.escape(user.display_name or user.first_name or user.email)
    text = html.escape(review.text) if review.text else "(desenho)"
    if review.parent_id:
        return f"<p>💬 Resposta de {who} à marcação em {position_label(review.parent)}: {text}</p>"
    icon = "🎬" if review.timecode is not None else "📍"
    return f"<p>{icon} Marcação de {who} em {position_label(review)}: {text}</p>"


def _project_role(user, project_id):
    return (
        ProjectMember.objects.filter(project_id=project_id, member=user, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _comment_activity(kind, request, issue, comment, current_instance=None):
    """Mesmas tarefas do endpoint de comentários: histórico, notificações e webhook."""
    origin = base_host(request=request, is_app=True)
    actor_id = str(request.user.id)
    epoch = int(timezone.now().timestamp())
    data = {"id": str(comment.id), "comment_html": comment.comment_html, "issue": str(issue.id)}
    slug = issue.workspace.slug

    def send():
        issue_activity.delay(
            type=f"comment.activity.{kind}",
            requested_data=json.dumps(
                {"comment_id": str(comment.id)} if kind == "deleted" else data, cls=DjangoJSONEncoder
            ),
            actor_id=actor_id,
            issue_id=str(issue.id),
            project_id=str(issue.project_id),
            current_instance=current_instance,
            epoch=epoch,
            notification=True,
            origin=origin,
        )
        if kind != "deleted":
            model_activity.delay(
                model_name="issue_comment",
                model_id=str(comment.id),
                requested_data={"comment_html": comment.comment_html},
                current_instance=current_instance,
                actor_id=actor_id,
                slug=slug,
                origin=origin,
            )

    transaction.on_commit(send)


def _snapshot(comment):
    return json.dumps(
        {"id": str(comment.id), "comment_html": comment.comment_html, "issue": str(comment.issue_id)},
        cls=DjangoJSONEncoder,
    )


def _number(value, low, high):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise serializers.ValidationError("Invalid number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise serializers.ValidationError("Invalid number")
    if number != number or not low <= number <= high:
        raise serializers.ValidationError("Invalid number")
    return number


class MediaReviewCommentEndpoint(BaseAPIView):
    """Comentários da revisão de um item: todos os anexos (versões) de uma vez."""

    def _issue(self, slug, project_id, issue_id, include_archived=False):
        manager = Issue.objects if include_archived else Issue.issue_objects
        return manager.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id, include_archived=True)
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        reviews = MediaReviewComment.objects.filter(
            issue=issue, asset__is_deleted=False, asset__deleted_at__isnull=True
        ).order_by("created_at")
        return Response(MediaReviewCommentSerializer(reviews, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        issue = self._issue(slug, project_id, issue_id)
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        # Convidado só comenta nos itens que criou, a menos que o projeto mostre tudo (igual aos comentários).
        if _project_role(request.user, project_id) == ROLE.GUEST.value:
            project = Project.objects.get(pk=project_id)
            if not project.guest_view_all_features and issue.created_by_id != request.user.id:
                return Response(
                    {"error": "You are not allowed to comment on the issue"}, status=status.HTTP_400_BAD_REQUEST
                )

        data = request.data
        parent = None
        if data.get("parent"):
            parent = MediaReviewComment.objects.filter(issue=issue, pk=data.get("parent")).first()
            if not parent:
                return Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
            # Um nível só: responder a uma resposta responde à marcação de cima.
            if parent.parent_id:
                parent = parent.parent
            asset = parent.asset
        else:
            asset = FileAsset.objects.filter(
                pk=data.get("asset"),
                issue=issue,
                entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                is_uploaded=True,
                is_deleted=False,
            ).first()
            if not asset:
                return Response({"error": "Invalid asset"}, status=status.HTTP_400_BAD_REQUEST)

        text = (data.get("text") or "").strip()
        if len(text) > MAX_TEXT:
            return Response({"error": "Text too long"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            drawing = [] if parent else clean_drawing(data.get("drawing"))
            timecode = None if parent else _number(data.get("timecode"), 0, 7 * 24 * 3600)
            x = None if parent else _number(data.get("x"), 0, 100)
            y = None if parent else _number(data.get("y"), 0, 100)
        except serializers.ValidationError as error:
            return Response({"error": str(error.detail[0])}, status=status.HTTP_400_BAD_REQUEST)

        if parent and not text:
            return Response({"error": "Text required"}, status=status.HTTP_400_BAD_REQUEST)
        if not parent:
            if timecode is None and (x is None or y is None):
                return Response({"error": "Position required"}, status=status.HTTP_400_BAD_REQUEST)
            if timecode is not None:
                x = y = None
            if not text and not drawing:
                return Response({"error": "Text required"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            review = MediaReviewComment(
                issue=issue,
                project_id=project_id,
                asset=asset,
                parent=parent,
                timecode=timecode,
                x=x,
                y=y,
                drawing=drawing,
                text=text,
            )
            comment = IssueComment.objects.create(
                issue=issue, project_id=project_id, actor=request.user, comment_html=mirror_html(review, request.user)
            )
            review.comment = comment
            review.save()
            _comment_activity("created", request, issue, comment)
        return Response(MediaReviewCommentSerializer(review).data, status=status.HTTP_201_CREATED)


class MediaReviewCommentDetailEndpoint(BaseAPIView):
    def _review(self, slug, project_id, issue_id, pk):
        return (
            MediaReviewComment.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id, issue__project_id=project_id, pk=pk
            )
            .select_related("issue", "issue__workspace", "parent", "comment")
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, issue_id, pk):
        review = self._review(slug, project_id, issue_id, pk)
        if not review:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        is_author = review.created_by_id == request.user.id
        role = _project_role(request.user, project_id)

        if "text" in request.data:
            # Só quem escreveu edita o texto.
            if not is_author:
                return Response({"error": "Only the author can edit"}, status=status.HTTP_403_FORBIDDEN)
            text = (request.data.get("text") or "").strip()
            if len(text) > MAX_TEXT:
                return Response({"error": "Text too long"}, status=status.HTTP_400_BAD_REQUEST)
            if not text and (review.parent_id or not review.drawing):
                return Response({"error": "Text required"}, status=status.HTTP_400_BAD_REQUEST)
            if text != review.text:
                review.text = text
                review.edited_at = timezone.now()

        if "resolved" in request.data:
            # Resolver é da equipe (e de quem fez a marcação); respostas não se resolvem.
            if review.parent_id:
                return Response({"error": "Replies cannot be resolved"}, status=status.HTTP_400_BAD_REQUEST)
            if not is_author and role not in (ROLE.ADMIN.value, ROLE.MEMBER.value):
                return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
            if bool(request.data.get("resolved")):
                if not review.resolved_at:
                    review.resolved_at = timezone.now()
                    review.resolved_by = request.user
            else:
                review.resolved_at = None
                review.resolved_by = None

        with transaction.atomic():
            review.save()
            comment = review.comment
            if comment and review.edited_at and "text" in request.data:
                html_text = mirror_html(review, request.user)
                if html_text != comment.comment_html:
                    current_instance = _snapshot(comment)
                    comment.comment_html = html_text
                    comment.edited_at = timezone.now()
                    comment.save()
                    _comment_activity("updated", request, review.issue, comment, current_instance)
        return Response(MediaReviewCommentSerializer(review).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def delete(self, request, slug, project_id, issue_id, pk):
        review = self._review(slug, project_id, issue_id, pk)
        if not review:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if review.created_by_id != request.user.id and _project_role(request.user, project_id) != ROLE.ADMIN.value:
            return Response({"error": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        # As cópias no feed saem junto, inclusive as das respostas.
        comment_ids = [review.comment_id] + list(review.replies.values_list("comment_id", flat=True))
        comments = list(IssueComment.objects.filter(pk__in=[cid for cid in comment_ids if cid]))
        with transaction.atomic():
            for comment in comments:
                current_instance = _snapshot(comment)
                comment.delete()
                _comment_activity("deleted", request, review.issue, comment, current_instance)
            review.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


# Conversão dos vídeos (fase 2): estado, e os arquivos gerados por um redirecionamento assinado, como os anexos.
# A reprodução assinada vale 6 h: um vídeo longo continua pedindo trechos (Range) na mesma URL.
PLAYBACK_URL_EXPIRATION = 6 * 3600
RENDITION_FILES = {
    "playback": ("playback_key", "video/mp4", "playback.mp4"),
    "poster": ("poster_key", "image/jpeg", "poster.jpg"),
    "sprite": ("sprite_key", "image/jpeg", "sprite.jpg"),
}


def _video_assets(issue):
    assets = FileAsset.objects.filter(
        issue=issue, entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT, is_uploaded=True, is_deleted=False
    )
    return [asset for asset in assets if is_video_asset(asset)]


def _rendition_data(rendition):
    return {
        "asset": str(rendition.asset_id),
        "status": rendition.status,
        "duration": rendition.duration,
        "width": rendition.width,
        "height": rendition.height,
        "fps": rendition.fps,
        "has_playback": bool(rendition.playback_key),
        "has_poster": bool(rendition.poster_key),
        "sprite": rendition.sprite if rendition.sprite_key else None,
        "error": rendition.error if rendition.status == MediaRendition.Status.FAILED else "",
        "updated_at": rendition.updated_at,
    }


class MediaRenditionEndpoint(BaseAPIView):
    """Estado da conversão dos vídeos do item. Um vídeo que ainda não passou pela conversão (enviado antes
    dela existir, ou por outro caminho) entra na fila aqui."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        assets = _video_assets(issue)
        existing = {r.asset_id: r for r in MediaRendition.objects.filter(asset__in=assets)}
        renditions = []
        for asset in assets:
            rendition = existing.get(asset.id) or queue_media_processing(asset)
            if rendition:
                renditions.append(_rendition_data(rendition))
        return Response(renditions, status=status.HTTP_200_OK)


class MediaRenditionFileEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id, asset_id, kind):
        if kind not in RENDITION_FILES:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        rendition = MediaRendition.objects.filter(
            asset_id=asset_id,
            asset__issue_id=issue_id,
            asset__issue__project_id=project_id,
            asset__workspace__slug=slug,
            asset__is_deleted=False,
        ).first()
        field, content_type, filename = RENDITION_FILES[kind]
        key = getattr(rendition, field, "") if rendition else ""
        if not key:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        url = S3Storage(request=request).generate_presigned_url(
            object_name=key,
            expiration=PLAYBACK_URL_EXPIRATION if kind == "playback" else None,
            disposition="inline",
            filename=filename,
            content_type=content_type,
        )
        if not url:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponseRedirect(url)


class MediaRenditionRetryEndpoint(BaseAPIView):
    """Tenta converter de novo um vídeo que falhou (só a equipe)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id, asset_id):
        asset = FileAsset.objects.filter(
            pk=asset_id,
            issue_id=issue_id,
            issue__project_id=project_id,
            workspace__slug=slug,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
            is_deleted=False,
        ).first()
        if not asset or not is_video_asset(asset):
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        rendition = queue_media_processing(asset)
        return Response(_rendition_data(rendition), status=status.HTTP_200_OK)
