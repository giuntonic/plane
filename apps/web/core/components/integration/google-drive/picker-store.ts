/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TGoogleDriveFile } from "@plane/types";

// Pespo: ponte entre o editor (packages/editor, que não conhece as stores nem
// os componentes do apps/web) e o seletor do Drive. O editor recebe
// `pickGoogleDriveFile` via extendedEditorProps e o modal é renderizado uma
// única vez, pelo GoogleDrivePickerHost montado no layout do app.

export type TPendingGoogleDrivePick = {
  allowCreate: boolean;
  resolve: (file: TGoogleDriveFile | null) => void;
};

let pending: TPendingGoogleDrivePick | null = null;
const listeners = new Set<() => void>();

export const setPendingGoogleDrivePick = (next: TPendingGoogleDrivePick | null) => {
  pending = next;
  listeners.forEach((listener) => listener());
};

export const subscribeGoogleDrivePick = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens the Drive picker and resolves with the chosen file (null when cancelled). */
export const pickGoogleDriveFile = (options: { allowCreate?: boolean } = {}): Promise<TGoogleDriveFile | null> =>
  new Promise((resolve) => {
    // Only one picker at a time — a second call cancels the first one.
    pending?.resolve(null);
    setPendingGoogleDrivePick({ allowCreate: options.allowCreate ?? true, resolve });
  });

export const getPendingGoogleDrivePick = () => pending;
