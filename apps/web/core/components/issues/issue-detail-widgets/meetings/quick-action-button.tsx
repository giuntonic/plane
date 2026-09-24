/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { PlusIcon } from "@plane/propel/icons";
import type { TIssueServiceType } from "@plane/types";
// local imports
import { IssueScheduleMeetingModal } from "./schedule-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

// Pespo: "Agendar reunião" nos botões do item de trabalho.
export const IssueMeetingActionButton = observer(function IssueMeetingActionButton(props: Props) {
  const { customButton, disabled = false, ...rest } = props;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Not a <button>: callers put this inside another button (a Disclosure
          toggle / widget button), same as the attachments action. */}
      <div
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(true);
          }
        }}
      >
        {customButton ?? <PlusIcon className="h-4 w-4" />}
      </div>
      <IssueScheduleMeetingModal isOpen={isOpen} onClose={() => setIsOpen(false)} {...rest} />
    </>
  );
});
