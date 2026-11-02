/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: meetings recorded from the Hub (browser capture), their transcript and minutes, and the client's
// "Solicitar reunião" (free/busy slots of the project's hosts).

export type TMeetingRecordingStatus = "recording" | "queued" | "transcribing" | "summarizing" | "ready" | "failed";
export type TMeetingSummaryStatus = "none" | "draft" | "published";
export type TMeetingTrack = "mic" | "tab" | "mix";

export type TMeetingNextStep = {
  tarefa: string;
  responsavel_id: string | null;
  responsavel: string | null;
  prazo: string | null;
  subtask_id: string | null;
};

export type TMeetingSummary = {
  resumo: string;
  pauta: string[];
  decisoes: string[];
  proximos_passos: TMeetingNextStep[];
  pendencias: string[];
};

export type TMeetingTranscriptSegment = {
  start: number;
  end: number;
  speaker: "recorder" | "others";
  text: string;
};

export type TMeetingRecording = {
  id: string;
  issue: string;
  project: string;
  calendar_event: string | null;
  title: string;
  status: TMeetingRecordingStatus;
  error: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  chunks: { mic: number; tab: number };
  created_by: string | null;
  created_by_name: string;
  transcribe_model: string;
  transcribed_at: string | null;
  summary: TMeetingSummary;
  summary_status: TMeetingSummaryStatus;
  summary_source: string;
  client_visible: boolean;
  published_at: string | null;
  published_comment: string | null;
  audio: Record<TMeetingTrack, boolean>;
  playback_track: TMeetingTrack | null;
  audio_deleted_at: string | null;
};

export type TMeetingRecordingDetail = TMeetingRecording & { transcript: TMeetingTranscriptSegment[] };

export type TMeetingBooking = {
  enabled: boolean;
  host_ids: string[];
  duration_minutes: number;
  day_start: string;
  day_end: string;
  weekdays: number[];
  notice_hours: number;
  window_days: number;
};

export type TMeetingSlots = {
  timezone: string;
  duration_minutes: number;
  window_days: number;
  hosts: string[];
  slots: { start: string; end: string }[];
};
