# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Pespo: capa do card (estilo Trello). A capa é um anexo de imagem do item marcado com
``attributes["pespo_cover"] = True``; no máximo um por item. Sem tabela própria: apagar o anexo tira a
capa junto. O primeiro anexo de imagem de um item sem capa vira a capa (como no Trello).
"""

# Module imports
from plane.db.models import FileAsset

COVER_FLAG = "pespo_cover"


def is_image_attachment(asset):
    return asset.entity_type == FileAsset.EntityTypeContext.ISSUE_ATTACHMENT and str(
        (asset.attributes or {}).get("type") or ""
    ).startswith("image/")


def issue_attachments(issue_id):
    return FileAsset.objects.filter(
        issue_id=issue_id, entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT, is_uploaded=True
    )


def set_issue_cover(issue_id, asset=None):
    """Põe ``asset`` como capa do item (tirando a marca dos outros anexos); ``None`` tira a capa."""
    for current in issue_attachments(issue_id).filter(**{f"attributes__{COVER_FLAG}": True}):
        if asset and current.id == asset.id:
            continue
        current.attributes = {key: value for key, value in current.attributes.items() if key != COVER_FLAG}
        current.save(update_fields=["attributes", "updated_at"])
    if asset and not (asset.attributes or {}).get(COVER_FLAG):
        asset.attributes = {**(asset.attributes or {}), COVER_FLAG: True}
        asset.save(update_fields=["attributes", "updated_at"])


def cover_on_first_image(asset):
    """Chamado quando o upload de um anexo termina: a primeira imagem de um item sem capa vira a capa."""
    if not is_image_attachment(asset):
        return
    if issue_attachments(asset.issue_id).filter(**{f"attributes__{COVER_FLAG}": True}).exists():
        return
    set_issue_cover(asset.issue_id, asset)


def cover_url(slug, project_id, issue_id, asset_id):
    return f"/api/assets/v2/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/attachments/{asset_id}/"
