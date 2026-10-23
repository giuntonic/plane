# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


class SaveOnlySentFieldsMixin:
    """Pespo: num update, grava só os campos que vieram no PATCH (mais updated_at/updated_by).

    Com o save() padrão a linha inteira é regravada a partir da cópia carregada no começo do
    request. Nas listas em árvore (subtarefas dos itens, tarefas da home) o Tab manda dois PATCHes
    quase juntos — o texto e o recuo — e o segundo, carregado antes do primeiro terminar,
    apagava o texto que o primeiro tinha acabado de salvar."""

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=[*validated_data.keys(), "updated_at", "updated_by"])
        return instance
