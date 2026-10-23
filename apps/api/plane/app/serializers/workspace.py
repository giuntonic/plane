# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from .user import UserLiteSerializer, UserAdminLiteSerializer


from plane.db.models import (
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
    WorkspaceTheme,
    WorkspaceUserProperties,
    WorkspaceUserLink,
    WorkspaceUserTask,
    UserRecentVisit,
    Issue,
    Page,
    Project,
    ProjectMember,
    WorkspaceHomePreference,
    Sticky,
    WorkspaceUserPreference,
)
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS
from plane.utils.url import contains_url
from plane.utils.content_validator import (
    validate_html_content,
    validate_binary_data,
    has_alphanumeric,
)

# Django imports
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
import json
import re


class WorkSpaceSerializer(DynamicBaseSerializer):
    total_members = serializers.IntegerField(read_only=True)
    logo_url = serializers.CharField(read_only=True)
    role = serializers.IntegerField(read_only=True)

    def validate_name(self, value):
        # Check if the name contains a URL
        if contains_url(value):
            raise serializers.ValidationError("Name must not contain URLs")
        # Reject symbol-only names like "-_________-" that have no letter or
        # digit. Mirrors the frontend HAS_ALPHANUMERIC_REGEX check so the rule
        # cannot be bypassed via a direct API call.
        if not has_alphanumeric(value):
            raise serializers.ValidationError(
                "Name must contain at least one letter or number"
            )
        return value

    def validate_slug(self, value):
        # Check if the slug is restricted
        if value in RESTRICTED_WORKSPACE_SLUGS:
            raise serializers.ValidationError("Slug is not valid")
        # Slug should only contain alphanumeric characters, hyphens, and underscores
        if not re.match(r"^[a-zA-Z0-9_-]+$", value):
            raise serializers.ValidationError(
                "Slug can only contain letters, numbers, hyphens (-), and underscores (_)"
            )
        return value

    class Meta:
        model = Workspace
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "owner",
            "logo_url",
            "deleted_at",
        ]


class WorkspaceLiteSerializer(BaseSerializer):
    class Meta:
        model = Workspace
        fields = ["name", "slug", "id", "logo_url"]
        read_only_fields = fields


class WorkSpaceMemberSerializer(DynamicBaseSerializer):
    member = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"
        read_only_fields = [
            "id",
            "workspace",
            "is_active",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
        ]


class WorkspaceMemberMeSerializer(BaseSerializer):
    draft_issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"


class WorkspaceMemberAdminSerializer(WorkSpaceMemberSerializer):
    member = UserAdminLiteSerializer(read_only=True)


class WorkSpaceMemberInviteSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    invite_link = serializers.SerializerMethodField()

    def get_invite_link(self, obj):
        return f"/workspace-invitations/?invitation_id={obj.id}&slug={obj.workspace.slug}&token={obj.token}"

    class Meta:
        model = WorkspaceMemberInvite
        fields = "__all__"
        read_only_fields = [
            "id",
            "email",
            "token",
            "workspace",
            "message",
            "responded_at",
            "created_at",
            "updated_at",
            "invite_link",
        ]


class WorkSpaceMemberInvitePublicSerializer(BaseSerializer):
    """Safe read-only serializer for the public workspace invite GET endpoint.

    Intentionally excludes ``token`` and ``invite_link`` so that an
    unauthenticated caller cannot retrieve the acceptance token and use it to
    hijack an invitation (GHSA-86mg-259g-pwgg / GHSA-gf48-p6jp-cwc4).
    """

    workspace = WorkspaceLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMemberInvite
        fields = [
            "id",
            "email",
            "workspace",
            "role",
            "message",
            "accepted",
            "responded_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields


class WorkspaceThemeSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceTheme
        fields = "__all__"
        read_only_fields = ["workspace", "actor"]


class WorkspaceUserPropertiesSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserProperties
        fields = "__all__"
        read_only_fields = ["workspace", "user"]


GUEST_ROLE = 5


def work_item_link_detail(issue, user_id, project_role):
    """Pespo: o que a home mostra de um link rápido pra item de trabalho — sempre o
    nome e o estado atuais do item. None quando o item foi apagado ou quando a pessoa
    não tem (ou deixou de ter) acesso a ele; ``project_role`` é o papel dela no projeto
    do item (None = não é membro ativo)."""
    if issue is None or issue.deleted_at is not None or issue.project.deleted_at is not None:
        return None
    if project_role is None:
        return None
    if (
        project_role <= GUEST_ROLE
        and not issue.project.guest_view_all_features
        and issue.created_by_id != user_id
    ):
        return None
    return {
        "id": str(issue.id),
        "name": issue.name,
        "sequence_id": issue.sequence_id,
        "project_id": str(issue.project_id),
        "project_identifier": issue.project.identifier,
        "state_group": issue.state.group if issue.state else None,
        "state_color": issue.state.color if issue.state else None,
    }


class WorkspaceUserLinkSerializer(BaseSerializer):
    issue_detail = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceUserLink
        fields = "__all__"
        # O item de um link vem validado pela view (precisa ser do workspace e visível pra pessoa).
        read_only_fields = ["workspace", "owner", "issue"]
        extra_kwargs = {"url": {"required": False}}

    def get_issue_detail(self, obj):
        if not obj.issue_id:
            return None
        project_roles = self.context.get("project_roles")
        if project_roles is not None:
            project_role = project_roles.get(obj.issue.project_id)
        else:
            project_role = (
                ProjectMember.objects.filter(project_id=obj.issue.project_id, member_id=obj.owner_id, is_active=True)
                .values_list("role", flat=True)
                .first()
            )
        return work_item_link_detail(obj.issue, obj.owner_id, project_role)

    def validate(self, attrs):
        # Link pra site externo precisa de URL; o de item de trabalho ganha a URL do item na view.
        if self.instance is None and not attrs.get("url") and not self.context.get("issue"):
            raise serializers.ValidationError({"url": ["This field is required."]})
        return attrs

    def to_internal_value(self, data):
        url = data.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            data["url"] = "http://" + url

        return super().to_internal_value(data)

    def validate_url(self, value):
        url_validator = URLValidator()
        try:
            url_validator(value)
        except ValidationError:
            raise serializers.ValidationError({"error": "Invalid URL format."})

        return value

    def create(self, validated_data):
        # Filtering the WorkspaceUserLink with the given url to check if the link already exists.

        url = validated_data.get("url")

        workspace_user_link = WorkspaceUserLink.objects.filter(
            url=url,
            workspace_id=validated_data.get("workspace_id"),
            owner_id=validated_data.get("owner_id"),
        )

        if workspace_user_link.exists():
            raise serializers.ValidationError({"error": "URL already exists for this workspace and owner"})

        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Filtering the WorkspaceUserLink with the given url to check if the link already exists.

        url = validated_data.get("url")

        workspace_user_link = WorkspaceUserLink.objects.filter(
            url=url, workspace_id=instance.workspace_id, owner=instance.owner
        )

        if workspace_user_link.exclude(pk=instance.id).exists():
            raise serializers.ValidationError({"error": "URL already exists for this workspace and owner"})

        return super().update(instance, validated_data)


class WorkspaceUserTaskSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserTask
        fields = "__all__"
        # O ``parent`` vem validado pela view (tarefa da mesma pessoa, sem ciclo).
        read_only_fields = ["workspace", "owner", "parent"]


class IssueRecentVisitSerializer(serializers.ModelSerializer):
    project_identifier = serializers.SerializerMethodField()
    assignees = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "state",
            "priority",
            "assignees",
            "type",
            "sequence_id",
            "project_id",
            "project_identifier",
        ]

    def get_project_identifier(self, obj):
        project = obj.project
        return project.identifier if project else None

    def get_assignees(self, obj):
        return list(obj.assignees.filter(issue_assignee__deleted_at__isnull=True).values_list("id", flat=True))


class ProjectRecentVisitSerializer(serializers.ModelSerializer):
    project_members = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "name", "logo_props", "project_members", "identifier"]

    def get_project_members(self, obj):
        members = ProjectMember.objects.filter(project_id=obj.id, member__is_bot=False, is_active=True).values_list(
            "member", flat=True
        )

        return members


class PageRecentVisitSerializer(serializers.ModelSerializer):
    project_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "logo_props",
            "project_id",
            "owned_by",
            "project_identifier",
        ]

    def get_project_id(self, obj):
        return obj.project_id if hasattr(obj, "project_id") else obj.projects.values_list("id", flat=True).first()

    def get_project_identifier(self, obj):
        project = obj.projects.first()

        return project.identifier if project else None


def get_entity_model_and_serializer(entity_type):
    entity_map = {
        "issue": (Issue, IssueRecentVisitSerializer),
        "page": (Page, PageRecentVisitSerializer),
        "project": (Project, ProjectRecentVisitSerializer),
    }
    return entity_map.get(entity_type, (None, None))


class WorkspaceRecentVisitSerializer(BaseSerializer):
    entity_data = serializers.SerializerMethodField()

    class Meta:
        model = UserRecentVisit
        fields = ["id", "entity_name", "entity_identifier", "entity_data", "visited_at"]
        read_only_fields = ["workspace", "owner", "created_by", "updated_by"]

    def get_entity_data(self, obj):
        entity_name = obj.entity_name
        entity_identifier = obj.entity_identifier

        entity_model, entity_serializer = get_entity_model_and_serializer(entity_name)

        if entity_model and entity_serializer:
            try:
                entity = entity_model.objects.get(pk=entity_identifier)

                return entity_serializer(entity).data
            except entity_model.DoesNotExist:
                return None
        return None


HOME_WIDGET_CONFIG_MAX_LENGTH = 2000


class WorkspaceHomePreferenceSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceHomePreference
        fields = ["key", "is_enabled", "config", "sort_order"]
        read_only_fields = ["workspace", "created_by", "updated_by"]

    def validate_config(self, value):
        # Pespo: preferências do widget na home (tamanho na grade, agendas do widget de
        # agenda…). O frontend manda o objeto inteiro; aqui só garantimos forma e tamanho.
        if not isinstance(value, dict):
            raise serializers.ValidationError("config must be an object")
        if len(json.dumps(value)) > HOME_WIDGET_CONFIG_MAX_LENGTH:
            raise serializers.ValidationError("config is too large")
        return value


class StickySerializer(BaseSerializer):
    class Meta:
        model = Sticky
        fields = "__all__"
        read_only_fields = ["workspace", "owner"]
        extra_kwargs = {"name": {"required": False}}

    def validate(self, data):
        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(data["description_html"])
            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

        if "description_binary" in data and data["description_binary"]:
            is_valid, error_msg = validate_binary_data(data["description_binary"])
            if not is_valid:
                raise serializers.ValidationError({"description_binary": "Invalid binary data"})

        return data


class WorkspaceUserPreferenceSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserPreference
        fields = ["key", "is_pinned", "sort_order"]
        read_only_fields = ["workspace", "created_by", "updated_by"]
