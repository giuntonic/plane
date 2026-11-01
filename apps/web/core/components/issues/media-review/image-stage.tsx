/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { DrawingLayer } from "./drawing-layer";
import type { TDrawingShape, TDrawingTool, TReviewMarker } from "./types";
import { useFitBox } from "./use-fit-box";

type Props = {
  src: string;
  alt: string;
  markers: TReviewMarker[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  /** Ponto do comentário que está sendo escrito (em %). */
  draftPoint: { x: number; y: number } | null;
  onPointClick?: (point: { x: number; y: number }) => void;
  shapes: TDrawingShape[];
  drawTool: TDrawingTool | null;
  drawColor: string;
  drawWidth: number;
  onShapeComplete: (shape: TDrawingShape) => void;
  fill?: boolean;
};

/** Imagem da peça com os pontos numerados dos comentários e o desenho por cima. */
export function ReviewImageStage(props: Props) {
  const {
    src,
    alt,
    markers,
    selectedId,
    onMarkerClick,
    draftPoint,
    onPointClick,
    shapes,
    drawTool,
    drawColor,
    drawWidth,
    onShapeComplete,
    fill = false,
  } = props;
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const box = useFitBox(areaRef, aspect, fill ? null : 0.6);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drawTool || !onPointClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPointClick({
      x: Math.min(Math.max(((event.clientX - rect.left) / rect.width) * 100, 0), 100),
      y: Math.min(Math.max(((event.clientY - rect.top) / rect.height) * 100, 0), 100),
    });
  };

  const pins = markers.filter((marker) => marker.x !== null && marker.y !== null);

  return (
    <div
      ref={areaRef}
      className={cn("flex w-full items-center justify-center overflow-hidden rounded-md bg-layer-2", fill && "h-full")}
    >
      {/* Clicar num ponto da imagem marca a posição (x/y); não há equivalente de teclado para isso. */}
      {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events, jsx_a11y/no-static-element-interactions */}
      <div
        className="relative"
        style={{
          width: box.width || "100%",
          height: box.height || undefined,
          cursor: drawTool ? "crosshair" : onPointClick ? "copy" : "default",
        }}
        onClick={handleClick}
      >
        <img
          src={src}
          alt={alt}
          className="block h-full w-full object-contain select-none"
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight);
          }}
          onError={() => setFailed(true)}
        />
        <DrawingLayer
          aspect={aspect}
          shapes={shapes}
          tool={drawTool}
          color={drawColor}
          width={drawWidth}
          onShapeComplete={onShapeComplete}
        />
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            title={pin.preview}
            onClick={(event) => {
              event.stopPropagation();
              onMarkerClick(pin.id);
            }}
            className={cn(
              "shadow-md absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-11 font-semibold text-white",
              pin.legacy ? "bg-black/50" : pin.resolved ? "bg-success-primary" : "bg-warning-primary",
              selectedId === pin.id && "z-10 scale-125 ring-2 ring-accent-strong",
              drawTool && "pointer-events-none"
            )}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            {pin.label.replace("#", "")}
          </button>
        ))}
        {draftPoint && (
          <div
            className="shadow-md pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-white bg-accent-primary"
            style={{ left: `${draftPoint.x}%`, top: `${draftPoint.y}%` }}
          />
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center bg-layer-2 p-4 text-center text-13 text-secondary">
            {t("media_review.image_failed")}
          </div>
        )}
      </div>
    </div>
  );
}
