# Pespo: tarefas da home em árvore (parent + sort_order, título pode ficar vazio enquanto
# a linha é digitada) e links rápidos que apontam pra um item de trabalho.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0133_issue_checklist_item"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="workspaceusertask",
            options={
                "ordering": ("sort_order", "created_at"),
                "verbose_name": "Workspace User Task",
                "verbose_name_plural": "Workspace User Tasks",
            },
        ),
        migrations.AlterField(
            model_name="workspaceusertask",
            name="title",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="workspaceusertask",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="children",
                to="db.workspaceusertask",
            ),
        ),
        migrations.AddField(
            model_name="workspaceusertask",
            name="sort_order",
            field=models.FloatField(default=65535),
        ),
        migrations.AddField(
            model_name="workspaceuserlink",
            name="issue",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="workspace_user_links",
                to="db.issue",
            ),
        ),
    ]
