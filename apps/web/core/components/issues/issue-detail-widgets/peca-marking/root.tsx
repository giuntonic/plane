/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Widget "Revisão da peça" (antes "Marcação da Peça"): a revisão de imagem e vídeo do item, no lugar
 * do Clapshot (ver components/issues/media-review). Só aparece quando o item tem imagem ou vídeo
 * anexado. O id do widget continua "peca-marking" (widgets abertos e escondidos).
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton, ModalCore } from "@plane/ui";
// components
import { MediaReview, useReviewVersions } from "@/components/issues/media-review";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const PecaMarkingCollapsible = observer(function PecaMarkingCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  // store hooks
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const versions = useReviewVersions(issueId, issueServiceType);

  // derived values
  const isCollapsibleOpen = openWidgets.includes("peca-marking");

  if (versions.length === 0) return null;

  const common = { workspaceSlug, projectId, issueId, disabled, issueServiceType };

  return (
    <>
      <Collapsible
        isOpen={isCollapsibleOpen}
        onToggle={() => toggleOpenWidget("peca-marking")}
        title={<CollapsibleButton isOpen={isCollapsibleOpen} title={t("media_review.title")} />}
        buttonClassName="w-full"
      >
        {isExpanded ? (
          <p className="px-1.5 pb-2 text-13 text-tertiary">{t("media_review.open_expanded")}</p>
        ) : (
          <MediaReview {...common} layout="compact" onExpand={() => setIsExpanded(true)} />
        )}
      </Collapsible>
      {/* Em cima do painel lateral: o clique no modal não pode fechar o item. */}
      <ModalCore
        isOpen={isExpanded}
        handleClose={() => setIsExpanded(false)}
        className="h-[92vh] max-w-[96vw] overflow-hidden sm:max-w-[96vw]"
        preventOutsideClick
      >
        <MediaReview {...common} layout="expanded" onClose={() => setIsExpanded(false)} />
      </ModalCore>
    </>
  );
});
