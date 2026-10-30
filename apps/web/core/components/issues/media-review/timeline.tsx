/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { formatTimecode } from "./helpers";
import type { TReviewMarker, TTimelinePreview } from "./types";

type Props = {
  duration: number;
  time: number;
  buffered: number;
  markers: TReviewMarker[];
  selectedId: string | null;
  loop: { start: number | null; end: number | null; enabled: boolean };
  onSeek: (time: number) => void;
  onMarkerClick: (id: string) => void;
  /** Grade de miniaturas da conversão: mostra o quadro ao passar o mouse. */
  preview?: TTimelinePreview | null;
};

function PreviewTile({ preview, time }: { preview: TTimelinePreview; time: number }) {
  const index = Math.min(preview.count - 1, Math.max(0, Math.floor(time / preview.interval)));
  const column = index % preview.columns;
  const row = Math.floor(index / preview.columns);
  return (
    <div
      className="mb-1 rounded-sm border border-white/30 bg-black bg-no-repeat"
      style={{
        width: preview.tile_width,
        height: preview.tile_height,
        backgroundImage: `url("${preview.url}")`,
        backgroundSize: `${preview.columns * preview.tile_width}px ${preview.rows * preview.tile_height}px`,
        backgroundPosition: `-${column * preview.tile_width}px -${row * preview.tile_height}px`,
      }}
    />
  );
}

/** Linha do tempo do vídeo: arrastar para buscar, os comentários como marcadores e o trecho em repetição. */
export function ReviewTimeline(props: Props) {
  const { duration, time, buffered, markers, selectedId, loop, onSeek, onMarkerClick, preview = null } = props;
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const percent = (value: number) => (duration > 0 ? Math.min(Math.max(value / duration, 0), 1) * 100 : 0);
  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration;
  };

  const loopStart = loop.start ?? 0;
  const loopEnd = loop.end ?? duration;
  const showLoop = loop.start !== null || loop.end !== null;

  return (
    <div className="relative px-1 pt-3 pb-1 select-none">
      {/* marcadores dos comentários, acima da barra */}
      <div className="pointer-events-none absolute inset-x-1 top-0 h-3">
        {markers
          .filter((marker) => marker.timecode !== null)
          .map((marker) => (
            <button
              key={marker.id}
              type="button"
              title={`${formatTimecode(marker.timecode!)} · ${marker.preview}`}
              aria-label={t("media_review.go_to_comment", { time: formatTimecode(marker.timecode!) })}
              onClick={() => onMarkerClick(marker.id)}
              className={cn(
                "pointer-events-auto absolute top-0 size-2.5 -translate-x-1/2 rounded-full border border-white/70 transition-transform hover:scale-150",
                marker.legacy ? "bg-white/50" : marker.resolved ? "bg-success-primary" : "bg-warning-primary",
                selectedId === marker.id && "scale-150 ring-2 ring-white"
              )}
              style={{ left: `${percent(marker.timecode!)}%` }}
            />
          ))}
      </div>
      {/* Barra de busca; o teclado (setas) é tratado no player, que recebe o foco. */}
      {/* oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
      <div
        ref={trackRef}
        className="group relative h-4 cursor-pointer"
        onPointerDown={(event) => {
          if (event.button !== 0 || duration <= 0) return;
          trackRef.current?.setPointerCapture(event.pointerId);
          setDragging(true);
          onSeek(timeAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (duration <= 0) return;
          const at = timeAt(event.clientX);
          setHover(at);
          if (dragging) onSeek(at);
        }}
        onPointerUp={(event) => {
          trackRef.current?.releasePointerCapture(event.pointerId);
          setDragging(false);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
          <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${percent(buffered)}%` }} />
          {showLoop && (
            <div
              className="absolute inset-y-0 bg-accent-primary/40"
              style={{ left: `${percent(loopStart)}%`, width: `${percent(loopEnd) - percent(loopStart)}%` }}
            />
          )}
          <div className="absolute inset-y-0 left-0 bg-accent-primary" style={{ width: `${percent(time)}%` }} />
        </div>
        <div
          className="shadow-sm absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${percent(time)}%` }}
        />
        {hover !== null && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center"
            style={{
              left: `clamp(${preview ? preview.tile_width / 2 : 20}px, ${percent(hover)}%, calc(100% - ${preview ? preview.tile_width / 2 : 20}px))`,
            }}
          >
            {preview && <PreviewTile preview={preview} time={hover} />}
            <span className="rounded-sm bg-black/80 px-1.5 py-0.5 text-11 text-white tabular-nums">
              {formatTimecode(hover)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
