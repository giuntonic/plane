# Generated manually for Pespo Hub (America/Sao_Paulo as default timezone everywhere it applies)

import pytz
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0125_alter_project_timezone'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workspace',
            name='timezone',
            field=models.CharField(
                default='America/Sao_Paulo',
                max_length=255,
                choices=tuple(zip(pytz.common_timezones, pytz.common_timezones)),
            ),
        ),
        migrations.AlterField(
            model_name='cycle',
            name='timezone',
            field=models.CharField(
                default='America/Sao_Paulo',
                max_length=255,
                choices=tuple(zip(pytz.common_timezones, pytz.common_timezones)),
            ),
        ),
        migrations.AlterField(
            model_name='user',
            name='user_timezone',
            field=models.CharField(
                default='America/Sao_Paulo',
                max_length=255,
                choices=tuple(zip(pytz.common_timezones, pytz.common_timezones)),
            ),
        ),
    ]
