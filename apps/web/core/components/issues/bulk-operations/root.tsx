/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

// Bulk operations (change state/priority/etc. for multiple work items at once) are a Plane One
// feature not available in this self-hosted build, so there is nothing to render here.
export const IssueBulkOperationsRoot = observer(function IssueBulkOperationsRoot(_props: Props) {
  return null;
});
