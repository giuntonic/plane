# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import MediaReviewComment

# Desenho por cima do quadro: uma lista de formas, com coordenadas de 0 a 1 (fração da largura e da
# altura da mídia) e a espessura como fração da largura, para o desenho ficar no lugar em qualquer
# tamanho de tela. "pen" é traço livre; "arrow" e "rect" têm só o ponto inicial e o final.
DRAWING_TOOLS = {"pen", "arrow", "rect"}
MAX_SHAPES = 100
MAX_PEN_POINTS = 2000
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_TEXT = 5000


def _coordinate(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise serializers.ValidationError("Invalid drawing point")
    return round(min(max(float(value), 0.0), 1.0), 4)


def clean_drawing(value):
    """Confere e normaliza o desenho; devolve a lista que vai para o banco."""
    if value in (None, ""):
        return []
    if not isinstance(value, list) or len(value) > MAX_SHAPES:
        raise serializers.ValidationError("Invalid drawing")
    shapes = []
    for shape in value:
        if not isinstance(shape, dict) or shape.get("tool") not in DRAWING_TOOLS:
            raise serializers.ValidationError("Invalid drawing shape")
        color = shape.get("color")
        if not isinstance(color, str) or not HEX_COLOR.match(color):
            raise serializers.ValidationError("Invalid drawing color")
        width = shape.get("width")
        if isinstance(width, bool) or not isinstance(width, (int, float)) or not 0.001 <= width <= 0.05:
            raise serializers.ValidationError("Invalid drawing width")
        points = shape.get("points")
        limit = MAX_PEN_POINTS if shape["tool"] == "pen" else 2
        if not isinstance(points, list) or not 1 <= len(points) <= limit:
            raise serializers.ValidationError("Invalid drawing points")
        if shape["tool"] != "pen" and len(points) != 2:
            raise serializers.ValidationError("Invalid drawing points")
        cleaned = []
        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise serializers.ValidationError("Invalid drawing point")
            cleaned.append([_coordinate(point[0]), _coordinate(point[1])])
        shapes.append(
            {"tool": shape["tool"], "color": color.lower(), "width": round(float(width), 4), "points": cleaned}
        )
    return shapes


class MediaReviewCommentSerializer(BaseSerializer):
    class Meta:
        model = MediaReviewComment
        fields = [
            "id",
            "issue",
            "project",
            "workspace",
            "asset",
            "parent",
            "timecode",
            "x",
            "y",
            "drawing",
            "text",
            "comment",
            "edited_at",
            "resolved_at",
            "resolved_by",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
