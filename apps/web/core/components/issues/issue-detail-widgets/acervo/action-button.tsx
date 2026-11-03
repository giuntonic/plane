/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Download, FolderOpen, Upload } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TAcervoLinkKind, TIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useAcervoActions, useIssueAcervo } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** Botão da equipe ("Arquivos") e do cliente ("Enviar material"). */
  teamButton: React.ReactNode;
  clientButton: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

const item = (icon: React.ReactNode, label: string) => (
  <div className="flex items-center gap-2">
    {icon}
    <span>{label}</span>
  </div>
);

/**
 * Pespo: Acervo da peça (Nextcloud) nos botões do item. A equipe gera e copia o link de envio ou de entrega e abre
 * a pasta no Arquivos; o cliente (convidado) tem "Enviar material", que abre a página de envio do Nextcloud.
 */
export const AcervoActionButton = observer(function AcervoActionButton(props: Props) {
  const { workspaceSlug, projectId, issueId, teamButton, clientButton, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  const { setLastWidgetAction } = useIssueDetail(issueServiceType);
  const { data } = useIssueAcervo(workspaceSlug, projectId, issueId);
  const actions = useAcervoActions(workspaceSlug, projectId, issueId);

  if (!data?.enabled) return null;

  // o cliente pode mandar material mesmo sem poder editar o item
  if (!data.is_team)
    return (
      <button type="button" onClick={() => void actions.openUpload()}>
        {clientButton}
      </button>
    );

  const create = async (kind: TAcervoLinkKind) => {
    if (await actions.createAndCopy(kind)) setLastWidgetAction("acervo");
  };

  return (
    <CustomMenu customButton={teamButton} placement="bottom-start" disabled={disabled} closeOnSelect>
      <CustomMenu.MenuItem onClick={() => void create("upload")}>
        {item(<Upload className="size-3.5" />, t("acervo.menu.upload"))}
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={() => void create("delivery")}>
        {item(<Download className="size-3.5" />, t("acervo.menu.delivery"))}
      </CustomMenu.MenuItem>
      <div className="my-1 border-t border-subtle" />
      <CustomMenu.MenuItem onClick={() => void actions.openFolder(data.folder?.files_url)}>
        {item(<FolderOpen className="size-3.5" />, t("acervo.open_folder"))}
      </CustomMenu.MenuItem>
    </CustomMenu>
  );
});
