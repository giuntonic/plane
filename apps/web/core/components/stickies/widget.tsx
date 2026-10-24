/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";

// plane imports
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
// hooks
import { useSticky } from "@/hooks/use-stickies";
// local imports
import { StickiesTruncated } from "./layout/stickies-truncated";
import { StickySearch } from "./modal/search";
import { useStickyOperations } from "./sticky/use-operations";

export const StickiesWidget = observer(function StickiesWidget() {
  // params
  const { workspaceSlug } = useParams();
  // store hooks
  const { creatingSticky, toggleShowNewSticky } = useSticky();
  const { t } = useTranslation();
  // sticky operations
  const { stickyOperations } = useStickyOperations({
    workspaceSlug: workspaceSlug?.toString() ?? "",
  });

  return (
    <div className="@container">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="truncate text-14 font-semibold text-tertiary">{t("stickies.title")}</div>
        {/* actions */}
        <div className="flex shrink-0 gap-2">
          <StickySearch />
          <button
            onClick={() => {
              toggleShowNewSticky(true);
              stickyOperations.create();
            }}
            className="my-auto flex gap-1 text-13 font-medium whitespace-nowrap text-accent-primary"
            disabled={creatingSticky}
            aria-label={t("stickies.add")}
          >
            <PlusIcon className="my-auto size-4" />
            {/* Pespo: no bloco estreito da home só o "+" cabe ao lado do título e da busca. */}
            <span className="hidden @xs:inline">{t("stickies.add")}</span>
            {creatingSticky && (
              <div
                className="size-4 animate-spin rounded-full border-2 border-accent-strong border-t-transparent"
                role="status"
                aria-label="loading"
              />
            )}
          </button>
        </div>
      </div>
      <div className="-mx-2">
        <StickiesTruncated />
      </div>
    </div>
  );
});
