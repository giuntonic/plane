/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: a lista de clientes, com o contrato ativo e o botão "Novo cliente".
import { useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { pespoClientsService } from "@/services/pespo-clients.service";
import { NewClientModal } from "./new-client-modal";

const cellClass = "px-3 py-2 text-left";

const daysUntil = (date: string) => Math.round((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);

export const PespoClientsList = observer(function PespoClientsList({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const { data, error, isLoading, mutate } = useSWR(workspaceSlug ? ["PESPO_CLIENTS", workspaceSlug] : null, () =>
    pespoClientsService.list(workspaceSlug)
  );
  const open = (clientId: string) => router.push(`/${workspaceSlug}/settings/clients/${clientId}/`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="size-3.5" />}
          onClick={() => setNewOpen(true)}
        >
          {t("pespo_clients.new.button")}
        </Button>
      </div>
      {error ? (
        <p className="text-body-sm-regular text-danger-primary">{t("pespo_clients.error")}</p>
      ) : isLoading || !data ? (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="40px" />
          <Loader.Item height="40px" />
        </Loader>
      ) : data.clients.length === 0 ? (
        <p className="text-body-sm-regular text-tertiary">{t("pespo_clients.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full min-w-[640px] text-body-xs-regular">
            <thead className="bg-layer-1 text-tertiary">
              <tr>
                <th className={cellClass}>{t("pespo_clients.col_client")}</th>
                <th className={cellClass}>{t("pespo_clients.col_project")}</th>
                <th className={cellClass}>{t("pespo_clients.col_contract")}</th>
                <th className={cellClass}>{t("pespo_clients.col_logins")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {data.clients.map((client) => {
                const left = client.contract ? daysUntil(client.contract.end_date) : null;
                return (
                  <tr
                    key={client.id}
                    className="cursor-pointer hover:bg-layer-transparent-hover"
                    onClick={() => open(client.id)}
                  >
                    <td className={cellClass}>
                      <button type="button" className="text-primary hover:underline" onClick={() => open(client.id)}>
                        {client.name}
                      </button>
                    </td>
                    <td className={cellClass}>{client.project?.identifier ?? "–"}</td>
                    <td className={cellClass}>
                      {client.contract ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {client.contract.contract_type} · {renderFormattedDate(client.contract.start_date)} –{" "}
                          {renderFormattedDate(client.contract.end_date)}
                          {left !== null && left <= 14 && (
                            <span className="flex items-center gap-0.5 text-warning-primary">
                              <AlertTriangle className="size-3" />
                              {left < 0
                                ? t("pespo_clients.expired")
                                : t("project_settings.contract.expires_in", { count: left })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-tertiary">{t("project_settings.contract.no_active")}</span>
                      )}
                    </td>
                    <td className={cellClass}>{client.logins}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <NewClientModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        workspaceSlug={workspaceSlug}
        templates={data?.project_templates ?? []}
        onCreated={(clientId) => {
          setNewOpen(false);
          void mutate();
          open(clientId);
        }}
      />
    </div>
  );
});
