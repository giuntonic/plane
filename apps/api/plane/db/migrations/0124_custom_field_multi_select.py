# Generated manually for the Custom Fields multi-select type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0123_custom_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customfield",
            name="field_type",
            field=models.CharField(
                choices=[
                    ("text", "Text"),
                    ("number", "Number"),
                    ("date", "Date"),
                    ("checkbox", "Checkbox"),
                    ("dropdown", "Dropdown"),
                    ("multi_select", "Multi-select"),
                ],
                default="text",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="issuecustomfieldvalue",
            name="multi_select_options",
            field=models.ManyToManyField(
                blank=True, related_name="multi_select_issue_values", to="db.customfieldoption"
            ),
        ),
    ]
