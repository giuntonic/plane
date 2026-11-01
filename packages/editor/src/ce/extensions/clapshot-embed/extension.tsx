/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { ClapshotEmbedNodeView } from "./components/node-view";
import { ClapshotEmbedExtensionConfig } from "./extension-config";

export function ClapshotEmbedExtension() {
  return ClapshotEmbedExtensionConfig.extend({
    addNodeView() {
      return ReactNodeViewRenderer(ClapshotEmbedNodeView);
    },
  });
}
