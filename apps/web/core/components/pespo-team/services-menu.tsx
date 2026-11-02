/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o atalho "Serviços" no topo: os apps da Pespo que as funções da pessoa veem (admins veem todos). Some
// quando não há nenhum. No lugar da homepage do painel admin.
import { observer } from "mobx-react";
import useSWR from "swr";
import { ExternalLink, LayoutGrid } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomMenu } from "@plane/ui";
import { pespoTeamService } from "@/services/pespo-team.service";

export const TeamServicesMenu = observer(function TeamServicesMenu({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { data } = useSWR(workspaceSlug ? ["TEAM_SERVICES_MINE", workspaceSlug] : null, () =>
    pespoTeamService.mine(workspaceSlug)
  );
  if (!data || data.length === 0) return null;

  return (
    <CustomMenu
      customButton={
        <Tooltip tooltipContent={t("pespo_team.menu")} position="bottom">
          <span className="grid size-8 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover">
            <LayoutGrid className="size-4" />
          </span>
        </Tooltip>
      }
      placement="bottom-end"
      ariaLabel={t("pespo_team.menu")}
      closeOnSelect
      maxHeight="lg"
    >
      {data.map((service) => (
        <CustomMenu.MenuItem key={service.id} onClick={() => window.open(service.url, "_blank", "noopener")}>
          <div className="flex w-64 items-start gap-2 py-0.5">
            <span className="w-5 shrink-0 text-center text-14">{service.icon || "🔧"}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1 text-body-xs-medium text-primary">
                {service.name}
                <ExternalLink className="size-3 text-tertiary" />
              </span>
              {service.description && (
                <span className="truncate text-caption-sm-regular text-tertiary">{service.description}</span>
              )}
            </span>
          </div>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
});
