/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: a transcrição da reunião, com busca e o áudio. Clicar numa fala leva o áudio até ela, e a fala que
// está tocando fica marcada.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TMeetingRecordingDetail } from "@plane/types";
import { cn } from "@plane/utils";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";

type TRef = { workspaceSlug: string; projectId: string; issueId: string };

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let index = lower.indexOf(query); index >= 0; index = lower.indexOf(query, cursor)) {
    parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, index)}</Fragment>);
    parts.push(
      <mark key={`m${index}`} className="rounded-xs bg-warning-subtle text-primary">
        {text.slice(index, index + query.length)}
      </mark>
    );
    cursor = index + query.length;
  }
  parts.push(<Fragment key="end">{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}

type Props = { reference: TRef; recording: TMeetingRecordingDetail };

export function MeetingTranscriptView({ reference, recording }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(-1);
  const needle = query.trim().toLowerCase();
  const segments = recording.transcript;
  const visible = useMemo(
    () =>
      segments
        .map((segment, index) => ({ segment, index }))
        .filter(({ segment }) => !needle || segment.text.toLowerCase().includes(needle)),
    [segments, needle]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const time = audio.currentTime;
      setCurrent(segments.findIndex((segment) => time >= segment.start && time < segment.end + 0.3));
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [segments]);

  const processing = ["recording", "queued", "transcribing"].includes(recording.status);
  const audioTrack = recording.audio_deleted_at ? null : recording.playback_track;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {audioTrack && (
        // oxlint-disable-next-line jsx_a11y/media-has-caption -- a transcrição abaixo é a legenda
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          className="w-full"
          src={meetingRecordingService.audioUrl(reference, recording.id, audioTrack)}
        />
      )}
      {recording.audio_deleted_at && (
        <p className="text-body-xs-regular text-tertiary">{t("meeting_recording.transcript.audio_deleted")}</p>
      )}
      {processing || segments.length === 0 ? (
        <p className="rounded-md border border-dashed border-subtle px-4 py-8 text-center text-body-sm-regular text-tertiary">
          {processing ? t("meeting_recording.transcript.waiting") : t("meeting_recording.transcript.empty")}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              className="min-w-0 flex-1 bg-transparent text-body-sm-regular text-primary placeholder:text-placeholder focus:outline-none"
              placeholder={t("meeting_recording.transcript.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ol className="vertical-scrollbar scrollbar-sm flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
            {visible.length === 0 && (
              <li className="py-6 text-center text-body-sm-regular text-tertiary">
                {t("meeting_recording.transcript.no_results")}
              </li>
            )}
            {visible.map(({ segment, index }) => (
              <li key={index}>
                <button
                  type="button"
                  disabled={!audioTrack}
                  onClick={() => {
                    if (!audioRef.current) return;
                    audioRef.current.currentTime = segment.start;
                    void audioRef.current.play();
                  }}
                  className={cn(
                    "flex w-full gap-3 rounded-md px-2 py-1.5 text-left hover:bg-layer-transparent-hover disabled:cursor-default disabled:hover:bg-transparent",
                    { "bg-accent-subtle": index === current }
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-caption-sm-regular text-tertiary tabular-nums">
                    {clock(segment.start)}
                  </span>
                  <span className="min-w-0 flex-1 text-body-sm-regular text-primary">
                    <span
                      className={cn(
                        "mr-1.5 text-body-xs-medium",
                        segment.speaker === "recorder" ? "text-accent-primary" : "text-secondary"
                      )}
                    >
                      {segment.speaker === "recorder"
                        ? recording.created_by_name
                        : t("meeting_recording.transcript.others")}
                    </span>
                    <Highlighted text={segment.text} query={needle} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {recording.transcribe_model && (
            <p className="text-caption-sm-regular text-placeholder">
              {t("meeting_recording.transcript.model", { model: recording.transcribe_model })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
