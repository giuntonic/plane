/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const getMeetingRecordingsKey = (issueId: string) => `MEETING_RECORDINGS_${issueId}`;
export const getMeetingRecordingKey = (recordingId: string) => `MEETING_RECORDING_${recordingId}`;

/** Estados em que o servidor ainda está trabalhando na gravação (a tela pergunta de novo de tempos em tempos). */
export const PROCESSING_STATUSES = new Set(["recording", "queued", "transcribing", "summarizing"]);
