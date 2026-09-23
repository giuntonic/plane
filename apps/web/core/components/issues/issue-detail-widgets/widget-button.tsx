/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// helpers
import { getButtonStyling } from "@plane/propel/button";
import { cn } from "@plane/utils";

type Props = {
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
};

// Renders as a plain div, not a button: every caller already places this
// inside its own interactive wrapper (a CustomMenu trigger or a dropzone),
// so a nested <button> here would be invalid HTML and break SSR hydration.
export function IssueDetailWidgetButton(props: Props) {
  const { icon, title, disabled = false } = props;
  return (
    <div className={cn(getButtonStyling("secondary", "lg"), { "pointer-events-none opacity-60": disabled })}>
      {icon}
      <span className="text-body-xs-medium">{title}</span>
    </div>
  );
}
