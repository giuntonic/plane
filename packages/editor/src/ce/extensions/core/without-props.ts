/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Extensions } from "@tiptap/core";
// local imports
import { ClapshotEmbedExtensionConfig } from "../clapshot-embed";

export const CoreEditorAdditionalExtensionsWithoutProps: Extensions = [ClapshotEmbedExtensionConfig];
