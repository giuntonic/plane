from django.db import migrations


def switch_default_order_to_manual(apps, schema_editor):
    """Pespo: a ordem padrão das visualizações passou a ser a manual (sort_order),
    pra que arrastar um item decida a posição dele. As preferências salvas com o
    padrão antigo ("-created_at") migram pra manual; quem escolheu outra ordem
    (prioridade, datas etc.) continua como está."""
    for model_name in ("ProjectUserProperty", "CycleUserProperties", "ModuleUserProperties"):
        Model = apps.get_model("db", model_name)
        rows = Model.objects.filter(display_filters__order_by="-created_at")
        for row in rows.iterator():
            row.display_filters = {**row.display_filters, "order_by": "sort_order"}
            row.save(update_fields=["display_filters"])


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0131_google_calendar_two_way_sync"),
    ]

    operations = [
        migrations.RunPython(switch_default_order_to_manual, migrations.RunPython.noop),
    ]
