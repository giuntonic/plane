# Merge migration: the Pespo fork (0123_project_metabase .. 0128_workspaceusertask,
# already applied in production) and upstream preview (dashboards + custom fields,
# 0123 .. 0125_merge) both branched off 0122, leaving two leaf nodes in the graph.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0128_workspaceusertask"),
        ("db", "0125_merge_dashboard_custom_fields"),
    ]

    operations = []
