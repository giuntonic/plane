/**
 * Widget "Marcação da Peça" — pins numerados em imagem / comentários por
 * timestamp em vídeo, no próprio work item. Só aparece quando o anexo mais
 * recente do work item é uma imagem ou vídeo.
 */

import React from "react";
import { observer } from "mobx-react";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { PecaMarkingCollapsibleContent } from "./content";
import { useLatestPecaAttachment } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const PecaMarkingCollapsible = observer(function PecaMarkingCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  // store hooks
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const { attachment, kind } = useLatestPecaAttachment(issueId, issueServiceType);

  // derived values
  const isCollapsibleOpen = openWidgets.includes("peca-marking");

  if (!attachment || !kind) return null;

  return (
    <Collapsible
      isOpen={isCollapsibleOpen}
      onToggle={() => toggleOpenWidget("peca-marking")}
      title={<CollapsibleButton isOpen={isCollapsibleOpen} title="Marcação da Peça" />}
      buttonClassName="w-full"
    >
      <PecaMarkingCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
        issueServiceType={issueServiceType}
        attachment={attachment}
        kind={kind}
      />
    </Collapsible>
  );
});
