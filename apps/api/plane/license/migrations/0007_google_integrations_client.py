from django.db import migrations

# Pespo: o login e as integrações (Google Calendar/Drive) passam a ter OAuth clients separados. O client que
# já estava configurado vira o das integrações — os tokens de quem já conectou Calendar/Drive foram emitidos
# pra ele e só ele consegue renová-los. O GOOGLE_CLIENT_ID continua com o mesmo valor até o admin trocá-lo
# pelo client novo do login (no god-mode). O valor é copiado como está (o segredo continua criptografado).
COPIES = (
    ("GOOGLE_CLIENT_ID", "GOOGLE_INTEGRATIONS_CLIENT_ID"),
    ("GOOGLE_CLIENT_SECRET", "GOOGLE_INTEGRATIONS_CLIENT_SECRET"),
)


def copy_login_client_to_integrations(apps, schema_editor):
    InstanceConfiguration = apps.get_model("license", "InstanceConfiguration")
    for source_key, target_key in COPIES:
        source = InstanceConfiguration.objects.filter(key=source_key).first()
        if not source or not source.value:
            continue
        target, _ = InstanceConfiguration.objects.get_or_create(
            key=target_key, defaults={"category": source.category, "is_encrypted": source.is_encrypted}
        )
        if target.value:
            continue
        target.value = source.value
        target.category = source.category
        target.is_encrypted = source.is_encrypted
        target.save(update_fields=["value", "category", "is_encrypted"])


class Migration(migrations.Migration):
    dependencies = [
        ("license", "0006_instance_is_current_version_deprecated"),
    ]

    operations = [
        migrations.RunPython(copy_login_client_to_integrations, migrations.RunPython.noop),
    ]
