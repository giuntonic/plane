# Merge migration: the dashboard and custom fields features were developed in
# parallel and both branched off 0122, leaving two leaf nodes in the graph.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0123_dashboard_dashboardwidget"),
        ("db", "0124_custom_field_multi_select"),
    ]

    operations = []
