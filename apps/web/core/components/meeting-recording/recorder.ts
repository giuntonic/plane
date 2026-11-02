/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o gravador de reunião do Hub. Grava duas faixas no navegador (o áudio da aba do Meet, com os outros
// participantes, e o microfone de quem grava) e manda pedaços de 10 s para o servidor enquanto a reunião
// acontece, então uma queda no meio não perde o que já foi. Um só por aba do Hub; continua gravando ao
// navegar dentro do Hub (o estado fica fora dos componentes).
import { useSyncExternalStore } from "react";
import { mutate } from "swr";
import type { TMeetingRecording } from "@plane/types";
// services
import { meetingRecordingService } from "@/services/meeting-recording.service";
// local imports
import { getMeetingRecordingsKey } from "./keys";

type TTrack = "mic" | "tab";
type TIssueRef = { workspaceSlug: string; projectId: string; issueId: string };

export type TRecorderError = "UNSUPPORTED" | "SHARE_CANCELLED" | "NO_TAB_AUDIO" | "START_FAILED" | "UPLOAD_INCOMPLETE";

export type TRecorderState = {
  status: "idle" | "starting" | "recording" | "stopping";
  ref: TIssueRef | null;
  label: string;
  recording: TMeetingRecording | null;
  startedAt: number;
  hasMic: boolean;
  pendingUploads: number;
  error: TRecorderError | null;
};

const CHUNK_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const FLUSH_TIMEOUT_MS = 120_000;
const IDLE: TRecorderState = {
  status: "idle",
  ref: null,
  label: "",
  recording: null,
  startedAt: 0,
  hasMic: false,
  pendingUploads: 0,
  error: null,
};

type TQueued = { track: TTrack; seq: number; blob: Blob; attempts: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isRecordingSupported = () =>
  typeof window !== "undefined" &&
  typeof MediaRecorder !== "undefined" &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  MediaRecorder.isTypeSupported("audio/webm;codecs=opus");

class MeetingRecorder {
  private state: TRecorderState = IDLE;
  private listeners = new Set<() => void>();
  private recorders: MediaRecorder[] = [];
  private streams: MediaStream[] = [];
  private seq: Record<TTrack, number> = { mic: 0, tab: 0 };
  private queue: TQueued[] = [];
  private uploading = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<TRecorderState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private warnBeforeLeaving = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };

  /** Chamar no clique (o navegador só abre a escolha da aba com um gesto da pessoa). */
  async start(ref: TIssueRef, options: { calendarEventId?: string; label: string }) {
    if (this.state.status !== "idle") return;
    if (!isRecordingSupported()) {
      this.set({ error: "UNSUPPORTED" });
      return;
    }
    this.set({ ...IDLE, status: "starting", ref, label: options.label });
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        systemAudio: "exclude",
      } as DisplayMediaStreamOptions);
    } catch {
      this.set({ ...IDLE, error: "SHARE_CANCELLED" });
      return;
    }
    const tabAudio = display.getAudioTracks()[0];
    // só o áudio interessa: a imagem da aba para logo
    for (const track of display.getVideoTracks()) track.stop();
    if (!tabAudio) {
      for (const track of display.getTracks()) track.stop();
      this.set({ ...IDLE, error: "NO_TAB_AUDIO" });
      return;
    }
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      mic = null; // sem microfone, grava só os outros
    }

    let recording: TMeetingRecording;
    try {
      recording = await this.createRecording(ref, options.calendarEventId);
    } catch {
      tabAudio.stop();
      for (const track of mic?.getTracks() ?? []) track.stop();
      this.set({ ...IDLE, error: "START_FAILED" });
      return;
    }

    this.streams = [new MediaStream([tabAudio]), ...(mic ? [mic] : [])];
    this.seq = { mic: 0, tab: 0 };
    this.queue = [];
    this.recorders = [];
    this.record("tab", this.streams[0]);
    if (mic) this.record("mic", mic);
    // "Parar de compartilhar" na barra do navegador encerra a gravação
    tabAudio.addEventListener("ended", () => void this.stop());
    window.addEventListener("beforeunload", this.warnBeforeLeaving);
    this.set({ status: "recording", recording, startedAt: Date.now(), hasMic: !!mic, error: null });
    void mutate(getMeetingRecordingsKey(ref.issueId));
  }

  private async createRecording(ref: TIssueRef, calendarEventId?: string) {
    const payload = calendarEventId ? { calendar_event: calendarEventId } : {};
    try {
      return await meetingRecordingService.create(ref, payload);
    } catch (error) {
      // uma gravação anterior ficou aberta (aba fechada no meio): fecha com o que chegou e começa a nova
      const previous = (error as { error?: string; recording?: TMeetingRecording })?.recording;
      if ((error as { error?: string })?.error !== "RECORDING_IN_PROGRESS" || !previous) throw error;
      await meetingRecordingService.finish(
        { workspaceSlug: ref.workspaceSlug, projectId: previous.project, issueId: previous.issue },
        previous.id,
        Math.round((Date.now() - new Date(previous.started_at).getTime()) / 1000)
      );
      void mutate(getMeetingRecordingsKey(previous.issue));
      return meetingRecordingService.create(ref, payload);
    }
  }

  private record(track: TTrack, stream: MediaStream) {
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32_000 });
    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data || event.data.size === 0) return;
      this.queue.push({ track, seq: this.seq[track]++, blob: event.data, attempts: 0 });
      this.set({ pendingUploads: this.queue.length });
      void this.drain();
    });
    recorder.start(CHUNK_MS);
    this.recorders.push(recorder);
  }

  private async drain() {
    if (this.uploading) return;
    this.uploading = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        const { ref, recording } = this.state;
        if (!ref || !recording) break;
        try {
          // um pedaço por vez, em ordem: o servidor junta na ordem de chegada
          // oxlint-disable-next-line no-await-in-loop
          await meetingRecordingService.uploadChunk(ref, recording.id, item.track, item.seq, item.blob);
          this.queue.shift();
        } catch (error) {
          if ((error as { error?: string })?.error === "RECORDING_FINISHED") {
            this.queue = [];
            break;
          }
          item.attempts += 1;
          // oxlint-disable-next-line no-await-in-loop -- espera antes de tentar o mesmo pedaço de novo
          await sleep(Math.min(MAX_BACKOFF_MS, 1000 * 2 ** item.attempts));
        }
        this.set({ pendingUploads: this.queue.length });
      }
    } finally {
      this.uploading = false;
    }
  }

  async stop() {
    if (this.state.status !== "recording") return;
    const { ref, recording, startedAt } = this.state;
    this.set({ status: "stopping" });
    // o stop() entrega o último pedaço antes do evento "stop"
    await Promise.all(
      this.recorders.map(
        (recorder) =>
          new Promise<void>((resolve) => {
            if (recorder.state === "inactive") return resolve();
            recorder.addEventListener("stop", () => resolve(), { once: true });
            recorder.stop();
          })
      )
    );
    for (const stream of this.streams) for (const track of stream.getTracks()) track.stop();
    window.removeEventListener("beforeunload", this.warnBeforeLeaving);

    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    void this.drain();
    // oxlint-disable-next-line no-await-in-loop -- espera a fila de envio esvaziar (com prazo)
    while ((this.queue.length > 0 || this.uploading) && Date.now() < deadline) await sleep(500);
    const incomplete = this.queue.length > 0;

    if (ref && recording) {
      try {
        await meetingRecordingService.finish(ref, recording.id, Math.round((Date.now() - startedAt) / 1000));
      } catch {
        // o servidor fecha sozinho em 30 min sem pedaços novos
      }
      void mutate(getMeetingRecordingsKey(ref.issueId));
    }
    this.recorders = [];
    this.streams = [];
    this.queue = [];
    this.set({ ...IDLE, error: incomplete ? "UPLOAD_INCOMPLETE" : null });
  }

  clearError() {
    this.set({ error: null });
  }
}

export const meetingRecorder = new MeetingRecorder();

export function useMeetingRecorder() {
  return useSyncExternalStore(meetingRecorder.subscribe, meetingRecorder.getSnapshot, meetingRecorder.getSnapshot);
}
