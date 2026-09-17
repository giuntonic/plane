# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class CustomFieldType(models.TextChoices):
    TEXT = "text", "Text"
    NUMBER = "number", "Number"
    DATE = "date", "Date"
    CHECKBOX = "checkbox", "Checkbox"
    DROPDOWN = "dropdown", "Dropdown"


class CustomField(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    field_type = models.CharField(max_length=30, choices=CustomFieldType.choices, default=CustomFieldType.TEXT)
    is_required = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    def __str__(self):
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="custom_field_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Custom Field"
        verbose_name_plural = "Custom Fields"
        db_table = "custom_fields"
        ordering = ("sort_order",)


class CustomFieldOption(ProjectBaseModel):
    custom_field = models.ForeignKey("db.CustomField", on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    def __str__(self):
        return f"{self.custom_field.name} <{self.name}>"

    class Meta:
        verbose_name = "Custom Field Option"
        verbose_name_plural = "Custom Field Options"
        db_table = "custom_field_options"
        ordering = ("sort_order",)


class IssueCustomFieldValue(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="custom_field_values")
    custom_field = models.ForeignKey(
        "db.CustomField", on_delete=models.CASCADE, related_name="issue_values"
    )
    text_value = models.TextField(blank=True, null=True)
    number_value = models.FloatField(blank=True, null=True)
    date_value = models.DateField(blank=True, null=True)
    boolean_value = models.BooleanField(blank=True, null=True)
    option = models.ForeignKey(
        "db.CustomFieldOption",
        on_delete=models.SET_NULL,
        related_name="issue_values",
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"{self.issue.name} <{self.custom_field.name}>"

    class Meta:
        unique_together = ["issue", "custom_field", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "custom_field"],
                condition=Q(deleted_at__isnull=True),
                name="issue_custom_field_value_unique_issue_field_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Custom Field Value"
        verbose_name_plural = "Issue Custom Field Values"
        db_table = "issue_custom_field_values"
        ordering = ("-created_at",)
