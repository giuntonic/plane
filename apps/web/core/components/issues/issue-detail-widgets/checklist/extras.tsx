/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSWRConfig } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueChecklistItem } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// services
import { issueChecklistService } from "@/services/issue-checklist.service";
// local imports
import type { TChecklistOperations } from "./helper";
import { getCardExtrasKey } from "@/components/issues/card-extras";
import { getIssueChecklistKey } from "./helper";

type Props = {
  item: TIssueChecklistItem;
  projectId: string;
  disabled: boolean;
  operations: TChecklistOperations;
};

/** Pespo: a linha vira item de trabalho (sub-item deste, ou solto no projeto), levando as sublinhas. */
const ConvertToWorkItemMenu = observer(function ConvertToWorkItemMenu(props: {
  item: TIssueChecklistItem;
  projectId: string;
}) {
  const { item, projectId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const { fetchIssue, fetchSubIssues, setPeekIssue } = useIssueDetail();
  const [isConverting, setIsConverting] = useState(false);
  const slug = workspaceSlug?.toString() ?? "";

  const convert = async (asSubItem: boolean) => {
    if (!slug || isConverting) return;
    setIsConverting(true);
    try {
      const created = await issueChecklistService.convertToWorkItem(slug, projectId, item.issue, item.id, asSubItem);
      await Promise.allSettled([
        mutate(getIssueChecklistKey(item.issue)),
        mutate(getCardExtrasKey(projectId)),
        fetchIssue(slug, projectId, item.issue),
        asSubItem ? fetchSubIssues(slug, projectId, item.issue) : Promise.resolve(),
      ]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("issue_checklist.converted", { name: created.name }),
        actionItems: (
          <button
            type="button"
            className="text-body-xs-medium text-accent-primary hover:underline"
            onClick={() => setPeekIssue({ workspaceSlug: slug, projectId: created.project_id, issueId: created.id })}
          >
            {t("issue_checklist.open")}
          </button>
        ),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("issue_checklist.convert_error") });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <CustomMenu
      customButton={
        <Tooltip tooltipContent={t("issue_checklist.convert")}>
          <span className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
            <ArrowUpRight className="size-3.5" />
          </span>
        </Tooltip>
      }
      customButtonClassName="flex-shrink-0"
      ariaLabel={t("issue_checklist.convert")}
      placement="bottom-end"
      disabled={isConverting}
      closeOnSelect
    >
      <CustomMenu.MenuItem onClick={() => void convert(true)}>
        {t("issue_checklist.convert_sub_item")}
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={() => void convert(false)}>
        {t("issue_checklist.convert_standalone")}
      </CustomMenu.MenuItem>
    </CustomMenu>
  );
});

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
      {!disabled && (
        <div className="flex flex-shrink-0 items-center opacity-0 group-hover/checklist-row:opacity-100 focus-within:opacity-100">
          <ConvertToWorkItemMenu item={item} projectId={projectId} />
        </div>
      )}
    </>
  );
});
