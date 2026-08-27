# Generated manually for Pespo Hub (Metabase dashboard embed per project)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0122_alter_draftissue_assignees_alter_issue_assignees_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='metabase_cliente_id',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='project',
            name='metabase_dashboard_id',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
