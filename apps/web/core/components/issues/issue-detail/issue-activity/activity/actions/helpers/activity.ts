/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueActivity } from "@plane/types";
import type { TTranslationStore } from "@plane/i18n";

export const getRelationActivityContent = (
  activity: TIssueActivity | undefined,
  t: TTranslationStore["t"]
): string | undefined => {
  if (!activity) return;

  switch (activity.field) {
    case "blocking":
      return activity.old_value === ""
        ? t("issue_activity.relation.blocking_added")
        : t("issue_activity.relation.blocking_removed");
    case "blocked_by":
      return activity.old_value === ""
        ? t("issue_activity.relation.blocked_by_added")
        : t("issue_activity.relation.blocked_by_removed");
    case "duplicate":
      return activity.old_value === ""
        ? t("issue_activity.relation.duplicate_added")
        : t("issue_activity.relation.duplicate_removed");
    case "relates_to":
      return activity.old_value === ""
        ? t("issue_activity.relation.relates_to_added")
        : t("issue_activity.relation.relates_to_removed");
  }

  return;
};
