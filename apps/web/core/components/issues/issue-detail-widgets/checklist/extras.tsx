/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueChecklistItem } from "@plane/types";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// local imports
import type { TChecklistOperations } from "./helper";

type Props = {
  item: TIssueChecklistItem;
  projectId: string;
  disabled: boolean;
  operations: TChecklistOperations;
};

/** Assignee and due date of a checklist line: always visible when set, on hover otherwise. */
export const IssueChecklistItemExtras = observer(function IssueChecklistItemExtras(props: Props) {
  const { item, projectId, disabled, operations } = props;
  const { t } = useTranslation();
  const dueDate = getDate(item.due_date);
  const isOverdue = !!dueDate && !item.is_completed && dueDate < new Date(new Date().toDateString());

  return (
    <>
      <div
        className={cn("flex flex-shrink-0 items-center", {
          "opacity-0 group-hover/checklist-row:opacity-100 focus-within:opacity-100": !item.assignee,
          hidden: disabled && !item.assignee,
        })}
      >
        <MemberDropdown
          projectId={projectId}
          value={item.assignee}
          onChange={(assignee) => void operations.update(item.id, { assignee })}
          multiple={false}
          disabled={disabled}
          buttonVariant="transparent-without-text"
          placeholder={t("issue_checklist.assignee")}
          showTooltip
        />
      </div>
      <div
        className={cn("flex flex-shrink-0 items-center", {
          "opacity-0 group-hover/checklist-row:opacity-100 focus-within:opacity-100": !item.due_date,
          hidden: disabled && !item.due_date,
        })}
      >
        <DateDropdown
          value={item.due_date}
          onChange={(date) => void operations.update(item.id, { due_date: renderFormattedPayloadDate(date) ?? null })}
          disabled={disabled}
          buttonVariant={item.due_date ? "transparent-with-text" : "transparent-without-text"}
          buttonClassName={cn({ "text-danger-primary": isOverdue })}
          placeholder={t("issue_checklist.due_date")}
          isClearable
          showTooltip
        />
      </div>
    </>
  );
});
