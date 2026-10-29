/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import type { ReactNode } from "react";
// plane imports
import type { TNotification } from "@plane/types";
import {
  convertMinutesToHoursMinutesString,
  renderFormattedDate,
  sanitizeCommentForNotification,
  stripAndTruncateHTML,
} from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
import {
  ADDITIONAL_NOTIFICATION_CONTENT_MAP,
  renderAdditionalAction,
  renderAdditionalValue,
  shouldShowConnector,
} from "../../notification-card/content";

// Types
export type TNotificationFieldData = {
  field: string | undefined;
  newValue: string | undefined;
  oldValue: string | undefined;
  verb: string | undefined;
};

export type TNotificationContentDetails = {
  action?: ReactNode;
  value?: ReactNode;
  showConnector?: boolean;
};

export type TNotificationContentHandler = (data: TNotificationFieldData) => TNotificationContentDetails | null;

export type TNotificationContentMap = {
  [key: string]: TNotificationContentHandler;
};

// Base notification content map for core fields
export const BASE_NOTIFICATION_CONTENT_MAP: TNotificationContentMap = {
  duplicate: ({ verb }) => ({
    action:
      verb === "created"
        ? i18nInstance.t("ui.notification.duplicate_marked")
        : i18nInstance.t("ui.notification.duplicate_unmarked"),
    value: null,
    showConnector: false,
  }),
  assignees: ({ newValue, oldValue }) => ({
    action:
      newValue !== ""
        ? i18nInstance.t("ui.notification.assignee_added")
        : i18nInstance.t("ui.notification.assignee_removed"),
    value: newValue !== "" ? newValue : oldValue,
    showConnector: false,
  }),
  start_date: ({ newValue }) => ({
    action:
      newValue !== ""
        ? i18nInstance.t("ui.notification.start_date_set")
        : i18nInstance.t("ui.notification.start_date_removed"),
    value: renderFormattedDate(newValue),
    showConnector: false,
  }),
  target_date: ({ newValue }) => ({
    action:
      newValue !== ""
        ? i18nInstance.t("ui.notification.due_date_set")
        : i18nInstance.t("ui.notification.due_date_removed"),
    value: renderFormattedDate(newValue),
    showConnector: false,
  }),
  labels: ({ newValue, oldValue }) => ({
    action:
      newValue !== "" ? i18nInstance.t("ui.notification.label_added") : i18nInstance.t("ui.notification.label_removed"),
    value: newValue !== "" ? newValue : oldValue,
    showConnector: false,
  }),
  parent: ({ newValue, oldValue }) => ({
    action:
      newValue !== ""
        ? i18nInstance.t("ui.notification.parent_added")
        : i18nInstance.t("ui.notification.parent_removed"),
    value: newValue !== "" ? newValue : oldValue,
    showConnector: false,
  }),
  relates_to: () => ({
    // Pespo: sem o conector ("related to to …" no upstream)
    action: i18nInstance.t("ui.notification.related_marked"),
    value: null,
    showConnector: false,
  }),
  comment: ({ newValue }, renderCommentBox?: boolean) => ({
    action: i18nInstance.t("ui.notification.commented"),
    value: renderCommentBox ? null : sanitizeCommentForNotification(newValue),
    showConnector: false,
  }),
  archived_at: ({ newValue }) => ({
    action:
      newValue === "restore" ? i18nInstance.t("ui.notification.restored") : i18nInstance.t("ui.notification.archived"),
    value: null,
    showConnector: false,
  }),
  None: () => ({
    action: i18nInstance.t("ui.notification.created_and_assigned"),
    value: null,
    showConnector: false,
  }),
  // Fields below only define value - action falls through to default handler
  attachment: ({ verb }) => ({
    action:
      verb === "deleted"
        ? i18nInstance.t("ui.notification.attachment_removed")
        : i18nInstance.t("ui.notification.attachment_added"),
    value: null,
    showConnector: false,
  }),
  description: ({ newValue }) => ({
    value: stripAndTruncateHTML(newValue || "", 55),
    showConnector: true,
  }),
  estimate_time: ({ newValue, oldValue }) => ({
    value:
      newValue !== ""
        ? convertMinutesToHoursMinutesString(Number(newValue))
        : convertMinutesToHoursMinutesString(Number(oldValue)),
    showConnector: true,
  }),
};

// Helper to get content details from maps
const getNotificationContentDetails = (
  fieldData: TNotificationFieldData,
  renderCommentBox?: boolean
): TNotificationContentDetails | null => {
  const { field } = fieldData;
  if (!field) return null;

  // Check base map first
  const baseHandler = BASE_NOTIFICATION_CONTENT_MAP[field];
  if (baseHandler) {
    // Special case for comment field that needs renderCommentBox
    if (field === "comment") {
      return (baseHandler as (data: TNotificationFieldData, renderCommentBox?: boolean) => TNotificationContentDetails)(
        fieldData,
        renderCommentBox
      );
    }
    return baseHandler(fieldData);
  }

  // Check additional map from plane-web (EE extensions)
  const additionalHandler = ADDITIONAL_NOTIFICATION_CONTENT_MAP[field];
  if (additionalHandler) {
    return additionalHandler(fieldData);
  }

  return null;
};

export function NotificationContent({
  notification,
  workspaceId,
  workspaceSlug,
  projectId,
  renderCommentBox = false,
}: {
  notification: TNotification;
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  renderCommentBox?: boolean;
}) {
  const { data, triggered_by_details: triggeredBy } = notification;
  const notificationField = data?.issue_activity.field;
  const newValue = data?.issue_activity.new_value;
  const oldValue = data?.issue_activity.old_value;
  const verb = data?.issue_activity.verb;

  const fieldData: TNotificationFieldData = {
    field: notificationField,
    newValue,
    oldValue,
    verb,
  };

  const renderTriggerName = () => (
    <span className="font-medium text-primary">
      {triggeredBy?.is_bot ? triggeredBy.first_name : triggeredBy?.display_name}{" "}
    </span>
  );

  // Get content details from map
  const contentDetails = getNotificationContentDetails(fieldData, renderCommentBox);

  // Render action - use map value if defined, otherwise fall through to default handler
  // Note: undefined = fall through to default, null = explicitly no action text
  const renderAction = (): ReactNode => {
    if (!notificationField) return "";
    // Check if action is explicitly defined in map (including null)
    if (contentDetails && "action" in contentDetails) return contentDetails.action;
    // Fallback to default action handler for fields not in map or without action defined
    return renderAdditionalAction(notificationField, verb);
  };

  // Render value - use map value if defined, otherwise fall through to default handler
  const renderValue = (): ReactNode => {
    // Check if value is explicitly defined in map
    if (contentDetails && "value" in contentDetails) return contentDetails.value;
    // Fallback to default value handler for fields not in map or without value defined
    return renderAdditionalValue(notificationField, newValue, oldValue);
  };

  // Determine if connector should be shown - prefer map value, fallback to function
  const showConnector =
    contentDetails?.showConnector !== undefined ? contentDetails.showConnector : shouldShowConnector(notificationField);

  return (
    <>
      {renderTriggerName()}
      <span className="text-tertiary">{renderAction()} </span>
      {verb !== "deleted" && (
        <>
          {showConnector && <span className="text-tertiary">{i18nInstance.t("ui.jsx_to")} </span>}
          <span className="font-medium text-primary">{renderValue()}</span>
          {notificationField === "comment" && renderCommentBox && (
            <div className="origin-left scale-75">
              <LiteTextEditor
                editable={false}
                id=""
                initialValue={newValue ?? ""}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                displayConfig={{
                  fontSize: "small-font",
                }}
              />
            </div>
          )}
          {"."}
        </>
      )}
    </>
  );
}
