/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { ClapshotEmbedNodeView } from "./components/node-view";
import { ClapshotEmbedExtensionConfig } from "./extension-config";
import type { TClapshotEmbedExtensionOptions } from "./types";

type Props = {
  onApproveEdit?: () => Promise<void>;
};

export function ClapshotEmbedExtension(props: Props = {}) {
  const { onApproveEdit } = props;

  return ClapshotEmbedExtensionConfig.extend<TClapshotEmbedExtensionOptions>({
    addOptions() {
      return {
        ...this.parent?.(),
        onApproveEdit,
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer(ClapshotEmbedNodeView);
    },
  });
}
