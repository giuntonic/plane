/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { GoogleDriveEmbedNodeView } from "./components/node-view";
import { GoogleDriveEmbedExtensionConfig } from "./extension-config";
import type { TGoogleDriveEmbedExtensionOptions } from "./types";

export function GoogleDriveEmbedExtension(props: TGoogleDriveEmbedExtensionOptions = {}) {
  const { onPickGoogleDriveFile } = props;

  return GoogleDriveEmbedExtensionConfig.extend<TGoogleDriveEmbedExtensionOptions>({
    addOptions() {
      return {
        ...this.parent?.(),
        onPickGoogleDriveFile,
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer(GoogleDriveEmbedNodeView);
    },
  });
}
