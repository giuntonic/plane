/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// local imports
import { DrawingLayer } from "./drawing-layer";
import { DEFAULT_FPS, PLAYBACK_RATES, estimateFps, formatTimecode } from "./helpers";
import { ReviewTimeline } from "./timeline";
import type { TDrawingShape, TDrawingTool, TReviewMarker, TTimelinePreview } from "./types";
import { useFitBox } from "./use-fit-box";

export type TVideoStageHandle = {
  seek: (time: number) => void;
  pause: () => void;
  currentTime: () => number;
};

type Props = {
  src: string;
  /** Capa (um quadro do vídeo, da conversão) e proporção conhecida antes de o vídeo carregar. */
  poster?: string;
  initialAspect?: number | null;
  /** Miniaturas para a prévia da linha do tempo. */
  preview?: TTimelinePreview | null;
  /** Texto no lugar do aviso de erro enquanto a conversão não termina. */
  pendingMessage?: string | null;
  /** Quadros por segundo conhecidos (conversão); sem isso, o player estima enquanto o vídeo toca. */
  fps?: number | null;
  markers: TReviewMarker[];
  selectedId: string | null;
  onMarkerClick: (id: string) => void;
  shapes: TDrawingShape[];
  drawTool: TDrawingTool | null;
  drawColor: string;
  drawWidth: number;
  onShapeComplete: (shape: TDrawingShape) => void;
  /** Avisa o tempo atual (no máximo 4 vezes por segundo, e sempre ao pausar ou buscar). */
  onTimeChange: (time: number, playing: boolean) => void;
  /** Ocupa a altura do contêiner (modal ampliado); sem isso, até 60% da tela. */
  fill?: boolean;
};

function ControlButton(props: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  const { label, onClick, active = false, children } = props;
  return (
    <Tooltip tooltipContent={label} position="top">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-sm text-white/80 hover:bg-white/10 hover:text-white",
          active && "bg-white/15 text-white"
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export const ReviewVideoStage = forwardRef<TVideoStageHandle, Props>(function ReviewVideoStage(props, ref) {
  const {
    src,
    poster,
    initialAspect = null,
    preview = null,
    pendingMessage = null,
    fps: knownFps = null,
    markers,
    selectedId,
    onMarkerClick,
    shapes,
    drawTool,
    drawColor,
    drawWidth,
    onShapeComplete,
    onTimeChange,
    fill = false,
  } = props;
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const boxAreaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(initialAspect || 16 / 9);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ start: number | null; end: number | null; enabled: boolean }>({
    start: null,
    end: null,
    enabled: false,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const lastReport = useRef(0);
  const onTimeChangeRef = useRef(onTimeChange);
  onTimeChangeRef.current = onTimeChange;

  const fps = knownFps || estimatedFps || DEFAULT_FPS;
  const box = useFitBox(boxAreaRef, aspect, fill || isFullscreen ? null : 0.6);

  const report = useCallback((value: number, isPlaying: boolean, force = false) => {
    const now = performance.now();
    if (!force && now - lastReport.current < 250) return;
    lastReport.current = now;
    onTimeChangeRef.current(value, isPlaying);
  }, []);

  // Enquanto toca: o tempo na tela, o trecho em repetição e a estimativa de quadros por segundo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    let frame = 0;
    let lastShown = 0;
    const tick = () => {
      const current = video.currentTime;
      const { start, end, enabled } = loopRef.current;
      if (enabled && end !== null && current >= end) video.currentTime = start ?? 0;
      const now = performance.now();
      if (now - lastShown > 50) {
        lastShown = now;
        setTime(current);
        report(current, true);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // requestVideoFrameCallback dá o tempo de cada quadro mostrado
    const deltas: number[] = [];
    let lastMediaTime: number | null = null;
    let handle = 0;
    const withFrames = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (lastMediaTime !== null) deltas.push(meta.mediaTime - lastMediaTime);
      lastMediaTime = meta.mediaTime;
      if (deltas.length >= 12) {
        const estimate = estimateFps(deltas.splice(0));
        if (estimate) setEstimatedFps(estimate);
      }
      handle = withFrames.requestVideoFrameCallback!(onFrame);
    };
    if (!knownFps && withFrames.requestVideoFrameCallback) handle = withFrames.requestVideoFrameCallback(onFrame);
    return () => {
      cancelAnimationFrame(frame);
      if (handle) withFrames.cancelVideoFrameCallback?.(handle);
    };
  }, [playing, knownFps, report]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // trocar de versão volta ao começo
  useEffect(() => {
    setFailed(false);
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setLoop({ start: null, end: null, enabled: false });
  }, [src]);

  const seek = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = Math.min(Math.max(value, 0), video.duration || value);
      video.currentTime = target;
      setTime(target);
      report(target, !video.paused, true);
    },
    [report]
  );

  useImperativeHandle(
    ref,
    () => ({
      seek,
      pause: () => videoRef.current?.pause(),
      currentTime: () => videoRef.current?.currentTime ?? 0,
    }),
    [seek]
  );

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const stepFrame = (direction: 1 | -1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // cai no meio do quadro, para o navegador não arredondar para o vizinho
    const index = Math.round(video.currentTime * fps) + direction;
    seek(Math.max(index, 0) / fps + 0.5 / fps);
  };

  const setLoopPoint = (which: "start" | "end") => {
    const current = videoRef.current?.currentTime ?? 0;
    setLoop((previous) => {
      let start = which === "start" ? current : previous.start;
      let end = which === "end" ? current : previous.end;
      if (start !== null && end !== null && start > end) [start, end] = [end, start];
      return { start, end, enabled: true };
    });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable=true]")) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === " " || event.key === "k") {
      handled();
      togglePlay();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      handled();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      if (event.shiftKey) seek((videoRef.current?.currentTime ?? 0) + direction);
      else stepFrame(direction);
    } else if (event.key === "i") {
      handled();
      setLoopPoint("start");
    } else if (event.key === "o") {
      handled();
      setLoopPoint("end");
    } else if (event.key === "l") {
      handled();
      setLoop((previous) => ({ ...previous, enabled: !previous.enabled }));
    } else if (event.key === "f") {
      handled();
      toggleFullscreen();
    }
  };

  return (
    // O player recebe o foco para os atalhos de teclado (espaço, setas, I/O/L, F).
    // oxlint-disable-next-line jsx_a11y/no-static-element-interactions, jsx_a11y/no-noninteractive-tabindex
    <div
      ref={stageRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-col overflow-hidden rounded-md bg-black outline-none focus-visible:ring-2 focus-visible:ring-accent-strong",
        (fill || isFullscreen) && "h-full",
        isFullscreen && "rounded-none"
      )}
    >
      <div
        ref={boxAreaRef}
        className={cn("flex w-full items-center justify-center", (fill || isFullscreen) && "min-h-0 flex-1")}
      >
        <div className="relative" style={{ width: box.width || "100%", height: box.height || undefined }}>
          {/* As legendas não existem nas peças; os comentários fazem esse papel. */}
          {/* oxlint-disable-next-line jsx_a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            preload="metadata"
            playsInline
            muted={muted}
            className="block h-full w-full object-contain"
            onClick={() => !drawTool && togglePlay()}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
              setDuration(Number.isFinite(video.duration) ? video.duration : 0);
              video.playbackRate = rate;
            }}
            onDurationChange={(event) => {
              const value = event.currentTarget.duration;
              if (Number.isFinite(value)) setDuration(value);
            }}
            onProgress={(event) => {
              const video = event.currentTarget;
              if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
            }}
            onPlay={() => setPlaying(true)}
            onPause={(event) => {
              setPlaying(false);
              setTime(event.currentTarget.currentTime);
              report(event.currentTarget.currentTime, false, true);
            }}
            onSeeked={(event) => {
              setTime(event.currentTarget.currentTime);
              report(event.currentTarget.currentTime, !event.currentTarget.paused, true);
            }}
            onEnded={() => setPlaying(false)}
            onError={() => setFailed(true)}
          />
          {!playing && (
            <DrawingLayer
              aspect={aspect}
              shapes={shapes}
              tool={drawTool}
              color={drawColor}
              width={drawWidth}
              onShapeComplete={onShapeComplete}
            />
          )}
          {failed && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-13 text-white">
              {pendingMessage ?? t("media_review.video_failed")}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 bg-black/90 px-2 pb-1.5">
        <ReviewTimeline
          duration={duration}
          time={time}
          buffered={buffered}
          markers={markers}
          selectedId={selectedId}
          loop={loop}
          onSeek={seek}
          onMarkerClick={onMarkerClick}
          preview={preview}
        />
        <div className="flex items-center gap-0.5">
          <ControlButton label={playing ? t("media_review.pause") : t("media_review.play")} onClick={togglePlay}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </ControlButton>
          <ControlButton label={t("media_review.previous_frame")} onClick={() => stepFrame(-1)}>
            <ChevronLeft className="size-4" />
          </ControlButton>
          <ControlButton label={t("media_review.next_frame")} onClick={() => stepFrame(1)}>
            <ChevronRight className="size-4" />
          </ControlButton>
          <span className="ml-1 truncate text-12 text-white/80 tabular-nums">
            {formatTimecode(time, true)} / {formatTimecode(duration, true)}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip tooltipContent={t("media_review.speed")} position="top">
              <button
                type="button"
                aria-label={t("media_review.speed")}
                onClick={() => {
                  const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
                  setRate(next);
                  if (videoRef.current) videoRef.current.playbackRate = next;
                }}
                className="h-7 min-w-9 shrink-0 rounded-sm px-1 text-12 text-white/80 tabular-nums hover:bg-white/10 hover:text-white"
              >
                {rate}×
              </button>
            </Tooltip>
            <ControlButton label={t("media_review.loop_start")} onClick={() => setLoopPoint("start")}>
              <span className="text-13 leading-none font-medium">[</span>
            </ControlButton>
            <ControlButton
              label={loop.enabled ? t("media_review.loop_off") : t("media_review.loop_on")}
              active={loop.enabled}
              onClick={() => setLoop((previous) => ({ ...previous, enabled: !previous.enabled }))}
            >
              <Repeat className="size-4" />
            </ControlButton>
            <ControlButton label={t("media_review.loop_end")} onClick={() => setLoopPoint("end")}>
              <span className="text-13 leading-none font-medium">]</span>
            </ControlButton>
            <ControlButton
              label={muted ? t("media_review.unmute") : t("media_review.mute")}
              onClick={() => setMuted(!muted)}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </ControlButton>
            <ControlButton
              label={isFullscreen ? t("media_review.exit_fullscreen") : t("media_review.fullscreen")}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
});
