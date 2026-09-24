/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueMeetingsCollapsibleContent } from "./content";
import { useIssueMeetings } from "./helper";
import { IssueMeetingActionButton } from "./quick-action-button";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: reuniões do Google Calendar ligadas ao item de trabalho. Só aparece
// quando há pelo menos uma (o botão "Agendar reunião" fica sempre visível).
export const MeetingsCollapsible = observer(function MeetingsCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { data: meetings } = useIssueMeetings(workspaceSlug, projectId, issueId);
  const count = meetings?.length ?? 0;
  const isCollapsibleOpen = openWidgets.includes("meetings");

  const indicatorElement = useMemo(
    () => (
      <span className="flex items-center justify-center">
        <p className="text-14 !leading-3 text-tertiary">{count}</p>
      </span>
    ),
    [count]
  );

  if (count === 0) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("meetings")}
      title={
        <CollapsibleButton
          isOpen={isCollapsibleOpen}
          title={t("google_calendar_integration.meetings.title")}
          indicatorElement={indicatorElement}
          actionItemElement={
            !disabled && (
              <IssueMeetingActionButton
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
                issueServiceType={issueServiceType}
              />
            )
          }
        />
      }
      buttonClassName="w-full"
    >
      <IssueMeetingsCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
        issueServiceType={issueServiceType}
      />
    </Collapsible>
  );
});
