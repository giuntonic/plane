/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueCalendarEvent,
  TMeetingRecording,
  TMeetingRecordingDetail,
  TMeetingSlots,
  TMeetingSummary,
  TMeetingTrack,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

type TIssueRef = { workspaceSlug: string; projectId: string; issueId: string };

const unwrap = <T>(promise: Promise<{ data: T } | undefined>): Promise<T> =>
  promise
    .then((response) => response?.data as T)
    .catch((error) => {
      throw error?.response?.data;
    });

// Pespo: reuniões gravadas pelo Hub (gravação, transcrição e ata) e o "Solicitar reunião".
export class MeetingRecordingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private issuePath({ workspaceSlug, projectId, issueId }: TIssueRef) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}`;
  }

  private path(ref: TIssueRef, id?: string, suffix = "") {
    return `${this.issuePath(ref)}/meeting-recordings/${id ? `${id}/` : ""}${suffix}`;
  }

  list(ref: TIssueRef): Promise<TMeetingRecording[]> {
    return unwrap(this.get(this.path(ref)));
  }

  /** Rejects with `{ error: "RECORDING_IN_PROGRESS", recording }` when this person is already recording. */
  create(ref: TIssueRef, data: { calendar_event?: string; title?: string }): Promise<TMeetingRecording> {
    return unwrap(this.post(this.path(ref), data));
  }

  uploadChunk(ref: TIssueRef, id: string, track: Exclude<TMeetingTrack, "mix">, seq: number, blob: Blob) {
    const form = new FormData();
    form.append("track", track);
    form.append("seq", String(seq));
    form.append("file", blob, `${track}-${seq}.webm`);
    return unwrap(
      this.post(this.path(ref, id, "chunks/"), form, { headers: { "Content-Type": "multipart/form-data" } })
    );
  }

  finish(ref: TIssueRef, id: string, durationSeconds: number): Promise<TMeetingRecording | undefined> {
    return unwrap(this.post(this.path(ref, id, "finish/"), { duration_seconds: durationSeconds }));
  }

  retrieve(ref: TIssueRef, id: string): Promise<TMeetingRecordingDetail> {
    return unwrap(this.get(this.path(ref, id)));
  }

  update(ref: TIssueRef, id: string, data: { summary?: TMeetingSummary; title?: string }) {
    return unwrap<TMeetingRecordingDetail>(this.patch(this.path(ref, id), data));
  }

  publish(ref: TIssueRef, id: string, clientVisible: boolean) {
    return unwrap<TMeetingRecordingDetail>(
      this.post(this.path(ref, id, "publish/"), { client_visible: clientVisible })
    );
  }

  createSubtasks(ref: TIssueRef, id: string, indexes: number[]) {
    return unwrap<TMeetingRecordingDetail & { created: number }>(
      this.post(this.path(ref, id, "subtasks/"), { indexes })
    );
  }

  retry(ref: TIssueRef, id: string) {
    return unwrap<TMeetingRecording>(this.post(this.path(ref, id, "retry/")));
  }

  remove(ref: TIssueRef, id: string): Promise<void> {
    return unwrap(this.delete(this.path(ref, id)));
  }

  /** Para o `<audio src>`: o servidor redireciona para o arquivo (a sessão vai pelo cookie). */
  audioUrl(ref: TIssueRef, id: string, track: TMeetingTrack) {
    return `${API_BASE_URL}${this.path(ref, id, `audio/${track}/`)}`;
  }

  slots(ref: TIssueRef, from: string, days: number): Promise<TMeetingSlots> {
    return unwrap(this.get(`${this.issuePath(ref)}/meeting-slots/`, { params: { from, days } }));
  }

  /** Rejects with `{ error: "SLOT_TAKEN" }` when the slot was taken in the meantime. */
  requestMeeting(ref: TIssueRef, start: string, note: string): Promise<TIssueCalendarEvent> {
    return unwrap(this.post(`${this.issuePath(ref)}/meeting-requests/`, { start, note }));
  }
}

export const meetingRecordingService = new MeetingRecordingService();
