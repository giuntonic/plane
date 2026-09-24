# Generated manually for Pespo Hub (America/Sao_Paulo as default project timezone)

import pytz
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0124_alter_profile_language'),
    ]

    operations = [
        migrations.AlterField(
            model_name='project',
            name='timezone',
            field=models.CharField(
                default='America/Sao_Paulo',
                max_length=255,
                choices=tuple(zip(pytz.common_timezones, pytz.common_timezones)),
            ),
        ),
    ]
