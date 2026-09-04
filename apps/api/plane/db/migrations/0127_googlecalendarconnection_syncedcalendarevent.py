# Generated manually to match GoogleCalendarConnection/SyncedCalendarEvent models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0126_alter_timezone_defaults"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleCalendarConnection",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("google_email", models.CharField(blank=True, max_length=255)),
                ("_access_token", models.TextField(blank=True, db_column="access_token")),
                ("_refresh_token", models.TextField(blank=True, db_column="refresh_token")),
                ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                ("plane_calendar_id", models.CharField(blank=True, max_length=255)),
                ("sync_enabled", models.BooleanField(default=True)),
                ("overlay_calendar_ids", models.JSONField(blank=True, default=list)),
                ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="google_calendar_connection",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Google Calendar Connection",
                "verbose_name_plural": "Google Calendar Connections",
                "db_table": "google_calendar_connections",
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="SyncedCalendarEvent",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("google_event_id", models.CharField(max_length=255)),
                (
                    "connection",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="synced_events",
                        to="db.googlecalendarconnection",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="synced_calendar_events",
                        to="db.issue",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Synced Calendar Event",
                "verbose_name_plural": "Synced Calendar Events",
                "db_table": "synced_calendar_events",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AlterUniqueTogether(
            name="syncedcalendarevent",
            unique_together={("connection", "issue")},
        ),
    ]
