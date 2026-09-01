# Generated manually for Pespo Hub (pt-BR as instance default language)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0123_project_metabase_cliente_id_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='profile',
            name='language',
            field=models.CharField(default='pt-BR', max_length=255),
        ),
    ]
