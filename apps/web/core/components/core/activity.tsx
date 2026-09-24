/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance, useTranslation } from "@plane/i18n";
import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// store hooks
// icons
import {
  TagIcon,
  CopyPlus,
  Calendar,
  Link2Icon,
  Users2Icon,
  ArchiveIcon,
  PaperclipIcon,
  TriangleIcon,
  LayoutGridIcon,
  SignalMediumIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";
import {
  BlockedIcon,
  BlockerIcon,
  CycleIcon,
  EpicIcon,
  IntakeIcon,
  ModuleIcon,
  RelatedIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueActivity } from "@plane/types";
import { renderFormattedDate, generateWorkItemLink, capitalizeFirstLetter } from "@plane/utils";
// helpers
import { useLabel } from "@/hooks/store/use-label";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types

export function IssueLink({ activity }: { activity: IIssueActivity }) {
  const { t } = useTranslation();
  // router params
  const { workspaceSlug } = useParams();
  const { isMobile } = usePlatformOS();

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString() ?? activity.workspace_detail?.slug,
    projectId: activity?.project,
    issueId: activity?.issue,
    projectIdentifier: activity?.project_detail?.identifier,
    sequenceId: activity?.issue_detail?.sequence_id,
  });

  return (
    <Tooltip
      tooltipContent={activity?.issue_detail ? activity.issue_detail.name : t("ui.this_work_item_has_been_deleted")}
      isMobile={isMobile}
    >
      {activity?.issue_detail ? (
        <a
          aria-disabled={activity.issue === null}
          href={workItemLink}
          target={activity.issue === null ? "_self" : "_blank"}
          rel={activity.issue === null ? "" : "noopener noreferrer"}
          className="inline items-center gap-1 font-medium text-primary hover:underline"
        >
          <span className="whitespace-nowrap">{`${activity.project_detail.identifier}-${activity.issue_detail.sequence_id}`}</span>{" "}
          <span className="font-regular break-all">{activity.issue_detail?.name}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-primary">
          {" a work item"}{" "}
        </span>
      )}
    </Tooltip>
  );
}

function UserLink({ activity }: { activity: IIssueActivity }) {
  // router params
  const { workspaceSlug } = useParams();

  return (
    <a
      href={`/${workspaceSlug ?? activity.workspace_detail?.slug}/profile/${
        activity.new_identifier ?? activity.old_identifier
      }`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center font-medium text-primary hover:underline"
    >
      {activity.new_value && activity.new_value !== "" ? activity.new_value : activity.old_value}
    </a>
  );
}

const LabelPill = observer(function LabelPill({ labelId, workspaceSlug }: { labelId: string; workspaceSlug: string }) {
  // store hooks
  const { workspaceLabels, fetchWorkspaceLabels } = useLabel();

  useEffect(() => {
    if (!workspaceLabels) fetchWorkspaceLabels(workspaceSlug);
  }, [fetchWorkspaceLabels, workspaceLabels, workspaceSlug]);

  return (
    <span
      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{
        backgroundColor: workspaceLabels?.find((l) => l.id === labelId)?.color ?? "#000000",
      }}
      aria-hidden="true"
    />
  );
});

const inboxActivityMessage = {
  declined: {
    showIssue: "declined work item",
    noIssue: "declined this work item from intake.",
  },
  snoozed: {
    showIssue: "snoozed work item",
    noIssue: "snoozed this work item.",
  },
  accepted: {
    showIssue: "accepted work item",
    noIssue: "accepted this work item from intake.",
  },
  markedDuplicate: {
    showIssue: "declined work item",
    noIssue: "declined this work item from intake by marking a duplicate work item.",
  },
};

const getInboxUserActivityMessage = (activity: IIssueActivity, showIssue: boolean) => {
  switch (activity.verb) {
    case "-1":
      return showIssue ? inboxActivityMessage.declined.showIssue : inboxActivityMessage.declined.noIssue;
    case "0":
      return showIssue ? inboxActivityMessage.snoozed.showIssue : inboxActivityMessage.snoozed.noIssue;
    case "1":
      return showIssue ? inboxActivityMessage.accepted.showIssue : inboxActivityMessage.accepted.noIssue;
    case "2":
      return showIssue ? inboxActivityMessage.markedDuplicate.showIssue : inboxActivityMessage.markedDuplicate.noIssue;
    default:
      return "updated intake work item status.";
  }
};

const activityDetails: {
  [key: string]: {
    message: (activity: IIssueActivity, showIssue: boolean, workspaceSlug: string) => React.ReactNode;
    icon: React.ReactNode;
  };
} = {
  assignees: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {i18nInstance.t("ui.jsx_added_a_new_assignee")} <UserLink activity={activity} />
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_to")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_assignee")} <UserLink activity={activity} />
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Users2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  archived_at: {
    message: (activity) => {
      if (activity.new_value === "restore")
        return (
          <>
            {i18nInstance.t("ui.jsx_restored")} <IssueLink activity={activity} />
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_archived")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <ArchiveIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  attachment: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            {i18nInstance.t("ui.jsx_uploaded_a_new_attachment")}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_to")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_an_attachment")}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <PaperclipIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  description: {
    message: (activity, showIssue) => (
      <>
        {i18nInstance.t("ui.jsx_updated_the_description")}
        {showIssue && (
          <>
            {" "}
            {i18nInstance.t("ui.jsx_of")} <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <MessageSquareIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  estimate_point: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_estimate_point")}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_set_the_estimate_point_to")} {activity.new_value}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_for")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <TriangleIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  issue: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            {i18nInstance.t("ui.jsx_created")} <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            {i18nInstance.t("ui.jsx_converted")} <IssueLink activity={activity} /> {i18nInstance.t("ui.jsx_to_an_epic")}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_deleted")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <WorkItemsIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  epic: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            {i18nInstance.t("ui.jsx_created")} <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            {i18nInstance.t("ui.jsx_converted")} <IssueLink activity={activity} />{" "}
            {i18nInstance.t("ui.jsx_to_a_work_item")}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_deleted")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <EpicIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  labels: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.old_value === "")
        return (
          <span className="overflow-hidden">
            {i18nInstance.t("ui.jsx_added_a_new_label")}{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.new_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.new_value}</span>
            </span>
            {showIssue && (
              <span className="">
                {" "}
                {i18nInstance.t("ui.jsx_to")} <IssueLink activity={activity} />
              </span>
            )}
          </span>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_label")}{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.old_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.old_value}</span>
            </span>
            {showIssue && (
              <span>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </span>
            )}
          </>
        );
    },
    icon: <TagIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  link: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            {i18nInstance.t("ui.jsx_added_this")}{" "}
            <a
              href={`${activity.new_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {i18nInstance.t("ui.jsx_link")}
            </a>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_to")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            {i18nInstance.t("ui.jsx_updated_the")}{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {i18nInstance.t("ui.jsx_link")}
            </a>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_this")}{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {i18nInstance.t("ui.jsx_link")}
            </a>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Link2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  cycles: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            <span className="flex-shrink-0">
              {i18nInstance.t("ui.jsx_added")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
              <span className="whitespace-nowrap">{i18nInstance.t("ui.jsx_to_the_cycle")}</span>{" "}
            </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            <span className="flex-shrink-0 whitespace-nowrap">{i18nInstance.t("ui.jsx_set_the_cycle_to")} </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed")} <IssueLink activity={activity} />{" "}
            {i18nInstance.t("ui.jsx_from_the_cycle")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <CycleIcon height={12} width={12} className="text-secondary" aria-hidden="true" />,
  },
  modules: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            {i18nInstance.t("ui.jsx_added")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_to_the_module")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            {i18nInstance.t("ui.jsx_set_the_module_to")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed")} <IssueLink activity={activity} />{" "}
            {i18nInstance.t("ui.jsx_from_the_module")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <ModuleIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  name: {
    message: (activity, showIssue) => (
      <>
        {i18nInstance.t("ui.jsx_set_the_title_to")} <span className="break-all">{activity.new_value}</span>
        {showIssue && (
          <>
            {" "}
            {i18nInstance.t("ui.jsx_of")} <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <MessageSquareIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  parent: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_parent")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_set_the_parent_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_for")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <UsersIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  priority: {
    message: (activity, showIssue) => (
      <>
        {i18nInstance.t("ui.jsx_set_the_priority_to")}{" "}
        <span className="font-medium text-primary">
          {activity.new_value ? capitalizeFirstLetter(activity.new_value) : "None"}
        </span>
        {showIssue && (
          <>
            {" "}
            {i18nInstance.t("ui.jsx_for")} <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <SignalMediumIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  relates_to: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {i18nInstance.t("ui.jsx_marked_that")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_relates_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_relation_from")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <RelatedIcon height="12" width="12" className="text-secondary" />,
  },
  blocking: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {i18nInstance.t("ui.jsx_marked")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_is_blocking_work_item")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_blocking_work_item")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockerIcon height="12" width="12" className="text-secondary" />,
  },
  blocked_by: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {i18nInstance.t("ui.jsx_marked")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_is_being_blocked_by")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_being_blocked_by_work_item")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockedIcon height="12" width="12" className="text-secondary" />,
  },
  duplicate: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {i18nInstance.t("ui.jsx_marked")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_as_duplicate_of")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_removed")} {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
            {i18nInstance.t("ui.jsx_as_a_duplicate_of")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <CopyPlus size={12} className="text-secondary" />,
  },
  state: {
    message: (activity, showIssue) => (
      <>
        {i18nInstance.t("ui.jsx_set_the_state_to")}{" "}
        <span className="font-medium break-all text-primary">{activity.new_value}</span>
        {showIssue && (
          <>
            {" "}
            {i18nInstance.t("ui.jsx_for")} <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <LayoutGridIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  start_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_start_date")}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_set_the_start_date_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_for")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  target_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {i18nInstance.t("ui.jsx_removed_the_due_date")}
            {showIssue && (
              <>
                {" "}
                {i18nInstance.t("ui.jsx_from")} <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {i18nInstance.t("ui.jsx_set_the_due_date_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  inbox: {
    message: (activity, showIssue) => (
      <>
        {getInboxUserActivityMessage(activity, showIssue)}
        {showIssue && (
          <>
            {" "}
            <IssueLink activity={activity} />
          </>
        )}
        {activity.verb === "2" && ` from intake by marking a duplicate work item.`}
      </>
    ),
    icon: <IntakeIcon className="size-3 text-secondary" aria-hidden="true" />,
  },
};

export function ActivityIcon({ activity }: { activity: IIssueActivity }) {
  return <>{activityDetails[activity.field as keyof typeof activityDetails]?.icon}</>;
}

type ActivityMessageProps = {
  activity: IIssueActivity;
  showIssue?: boolean;
};

export function ActivityMessage({ activity, showIssue = false }: ActivityMessageProps) {
  // router params
  const { workspaceSlug } = useParams();
  const activityField = activity.field ?? "issue";

  return (
    <>
      {activityDetails[activityField as keyof typeof activityDetails]?.message(
        activity,
        showIssue,
        workspaceSlug ? workspaceSlug.toString() : (activity.workspace_detail?.slug ?? "")
      )}
    </>
  );
}
