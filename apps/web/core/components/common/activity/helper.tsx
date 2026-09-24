/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import type { FC, ReactNode } from "react";
import {
  RotateCcw,
  Network,
  Inbox,
  AlignLeft,
  Paperclip,
  Type,
  FileText,
  Hash,
  Clock,
  Bell,
  GitBranch,
  Timer,
  ListTodo,
  Layers,
} from "lucide-react";
// components

import {
  LinkIcon,
  ArchiveIcon,
  CycleIcon,
  GlobeIcon,
  DueDatePropertyIcon,
  EstimatePropertyIcon,
  GridLayoutIcon,
  IntakeIcon,
  LabelPropertyIcon,
  MembersPropertyIcon,
  ModuleIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  StatePropertyIcon,
} from "@plane/propel/icons";
import { store } from "@/lib/store-context";
import type { TProjectActivity } from "@plane/types";

type ActivityIconMap = {
  [key: string]: FC<{ className?: string }>;
};
export const iconsMap: ActivityIconMap = {
  priority: PriorityPropertyIcon,
  archived_at: ArchiveIcon,
  restored: RotateCcw,
  link: LinkIcon,
  start_date: StartDatePropertyIcon,
  target_date: DueDatePropertyIcon,
  label: LabelPropertyIcon,
  inbox: Inbox,
  description: AlignLeft,
  assignee: MembersPropertyIcon,
  attachment: Paperclip,
  name: Type,
  state: StatePropertyIcon,
  estimate: EstimatePropertyIcon,
  cycle: CycleIcon,
  module: ModuleIcon,
  page: FileText,
  network: GlobeIcon,
  identifier: Hash,
  timezone: Clock,
  is_project_updates_enabled: Bell,
  is_epic_enabled: GridLayoutIcon,
  is_workflow_enabled: GitBranch,
  is_time_tracking_enabled: Timer,
  is_issue_type_enabled: ListTodo,
  default: Network,
  module_view: ModuleIcon,
  cycle_view: CycleIcon,
  issue_views_view: Layers,
  page_view: FileText,
  intake_view: IntakeIcon,
};

export const messages = (activity: TProjectActivity): { message: string | ReactNode; customUserName?: string } => {
  const activityType = activity.field;
  const newValue = activity.new_value;
  const oldValue = activity.old_value;
  const verb = activity.verb;
  const workspaceDetail = store.workspaceRoot.getWorkspaceById(activity.workspace);

  const getBooleanActionText = (value: string | undefined) => {
    if (value === "true") return "enabled";
    if (value === "false") return "disabled";
    return verb;
  };

  switch (activityType) {
    case "priority":
      return {
        message: (
          <>
            {i18nInstance.t("ui.jsx_set_the_priority_to")}{" "}
            <span className="font-medium text-primary">{newValue || "none"}</span>
          </>
        ),
      };
    case "archived_at":
      return {
        message: newValue === "restore" ? "restored the project" : "archived the project",
        customUserName: newValue === "archive" ? "Pespo Hub" : undefined,
      };
    case "name":
      return {
        message: (
          <>
            {i18nInstance.t("ui.jsx_renamed_the_project_to")}{" "}
            <span className="font-medium text-primary">{newValue}</span>
          </>
        ),
      };
    case "description":
      return {
        message: newValue ? "updated the project description" : "removed the project description",
      };
    case "start_date":
      return {
        message: (
          <>
            {newValue ? (
              <>
                {i18nInstance.t("ui.jsx_set_the_start_date_to")}{" "}
                <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              "removed the start date"
            )}
          </>
        ),
      };
    case "target_date":
      return {
        message: (
          <>
            {newValue ? (
              <>
                {i18nInstance.t("ui.jsx_set_the_target_date_to")}{" "}
                <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              "removed the target date"
            )}
          </>
        ),
      };
    case "state":
      return {
        message: (
          <>
            {i18nInstance.t("ui.jsx_set_the_state_to")}{" "}
            <span className="font-medium text-primary">{newValue || "none"}</span>
          </>
        ),
      };
    case "estimate":
      return {
        message: (
          <>
            {newValue ? (
              <>
                {i18nInstance.t("ui.jsx_set_the_estimate_point_to")}{" "}
                <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              <>
                {i18nInstance.t("ui.jsx_removed_the_estimate_point")}
                {oldValue && (
                  <>
                    {" "}
                    <span className="font-medium text-primary">{oldValue}</span>
                  </>
                )}
              </>
            )}
          </>
        ),
      };
    case "cycles":
      return {
        message: (
          <>
            <span>
              {verb} {i18nInstance.t("ui.jsx_this_project")} {verb === "removed" ? "from" : "to"}{" "}
              {i18nInstance.t("ui.jsx_the_cycle")}{" "}
            </span>
            {verb !== "removed" ? (
              <a
                href={`/${workspaceDetail?.slug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex font-medium text-primary"
              >
                {activity.new_value}
              </a>
            ) : (
              <span className="font-medium text-primary">
                {activity.old_value || i18nInstance.t("ui.unknown_cycle")}
              </span>
            )}
          </>
        ),
      };
    case "modules":
      return {
        message: (
          <>
            <span>
              {verb} {i18nInstance.t("ui.jsx_this_project")} {verb === "removed" ? "from" : "to"}{" "}
              {i18nInstance.t("ui.jsx_the_module")}{" "}
            </span>
            <span className="font-medium text-primary">
              {verb === "removed" ? oldValue : newValue || i18nInstance.t("ui.unknown_module")}
            </span>
          </>
        ),
      };
    case "labels":
      return {
        message: (
          <>
            {verb} {i18nInstance.t("ui.jsx_the_label")}{" "}
            <span className="font-medium text-primary">
              {newValue || oldValue || i18nInstance.t("ui.untitled_label")}
            </span>
          </>
        ),
      };
    case "inbox":
      return {
        message: (
          <>
            {newValue ? "enabled" : "disabled"} {i18nInstance.t("ui.jsx_inbox")}
          </>
        ),
      };
    case "page":
      return {
        message: (
          <>
            {newValue ? "created" : "removed"} {i18nInstance.t("ui.jsx_the_project_page")}{" "}
            <span className="font-medium text-primary">
              {newValue || oldValue || i18nInstance.t("ui.untitled_page")}
            </span>
          </>
        ),
      };
    case "network":
      return {
        message: (
          <>
            {newValue ? "enabled" : "disabled"} {i18nInstance.t("ui.jsx_network_access")}
          </>
        ),
      };
    case "identifier":
      return {
        message: (
          <>
            {i18nInstance.t("ui.jsx_updated_project_identifier_to")}{" "}
            <span className="font-medium text-primary">{newValue || "none"}</span>
          </>
        ),
      };
    case "timezone":
      return {
        message: (
          <>
            {i18nInstance.t("ui.jsx_changed_project_timezone_to")}{" "}
            <span className="font-medium text-primary">{newValue || "default"}</span>
          </>
        ),
      };
    case "module_view":
    case "cycle_view":
    case "issue_views_view":
    case "page_view":
    case "intake_view":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {activityType.replace(/_view$/, "").replace(/_/g, " ")}{" "}
            {i18nInstance.t("ui.jsx_view")}
          </>
        ),
      };
    case "is_project_updates_enabled":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {i18nInstance.t("ui.jsx_project_updates")}
          </>
        ),
      };
    case "is_epic_enabled":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {i18nInstance.t("ui.jsx_epics")}
          </>
        ),
      };
    case "is_workflow_enabled":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {i18nInstance.t("ui.jsx_custom_workflow")}
          </>
        ),
      };
    case "is_time_tracking_enabled":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {i18nInstance.t("ui.jsx_time_tracking")}
          </>
        ),
      };
    case "is_issue_type_enabled":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} {i18nInstance.t("ui.jsx_work_item_types")}
          </>
        ),
      };
    default:
      return {
        message: `${verb} ${activityType?.replace(/_/g, " ")} `,
      };
  }
};
