# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer

from plane.db.models import CustomField, CustomFieldOption, IssueCustomFieldValue

from rest_framework import serializers


class CustomFieldOptionSerializer(BaseSerializer):
    class Meta:
        model = CustomFieldOption
        fields = "__all__"
        read_only_fields = ["custom_field", "workspace", "project"]


class CustomFieldSerializer(BaseSerializer):
    options = CustomFieldOptionSerializer(read_only=True, many=True)

    class Meta:
        model = CustomField
        fields = "__all__"
        read_only_fields = ["workspace", "project", "options"]


class IssueCustomFieldValueSerializer(BaseSerializer):
    def validate(self, data):
        custom_field = data.get("custom_field") or getattr(self.instance, "custom_field", None)
        if custom_field is None:
            raise serializers.ValidationError("Custom field is required")

        field_type = custom_field.field_type
        if field_type == "dropdown" and data.get("option") and data["option"].custom_field_id != custom_field.id:
            raise serializers.ValidationError("The selected option does not belong to this custom field")
        if field_type == "multi_select" and data.get("multi_select_options"):
            for option in data["multi_select_options"]:
                if option.custom_field_id != custom_field.id:
                    raise serializers.ValidationError("The selected option does not belong to this custom field")
        if custom_field.is_required:
            value_present = any(
                [
                    data.get("text_value") not in (None, ""),
                    data.get("number_value") is not None,
                    data.get("date_value") is not None,
                    data.get("boolean_value") is not None,
                    data.get("option") is not None,
                    bool(data.get("multi_select_options")),
                ]
            )
            if not value_present:
                raise serializers.ValidationError("This custom field is required")
        return data

    class Meta:
        model = IssueCustomFieldValue
        fields = "__all__"
        read_only_fields = ["issue", "workspace", "project"]
