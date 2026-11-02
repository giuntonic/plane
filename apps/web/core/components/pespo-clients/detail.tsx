/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: o cliente: contrato ativo, histórico, renovação (com a opção de somar o saldo) e os logins do cliente.
import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPespoClientContract, TPespoContractInput } from "@plane/types";
import { Loader, TextArea, ToggleSwitch } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { pespoClientsService } from "@/services/pespo-clients.service";
import { ContractFields } from "./contract-fields";
import { clientErrorMessage, dayAfter, emptyContract } from "./helpers";

const cellClass = "px-3 py-2 text-left";

function renewalFrom(contract: TPespoClientContract | null): TPespoContractInput {
  if (!contract) return emptyContract();
  const base = emptyContract(dayAfter(contract.end_date));
  return {
    ...base,
    contract_type: contract.contract_type === "FEP" ? "FEP" : "FEE",
    urgent_limit: contract.urgent_limit,
    quantities: Object.fromEntries(contract.categories.map((c) => [c.category, c.contracted])),
  };
}

type Props = { workspaceSlug: string; clientId: string };

export const PespoClientDetail = observer(function PespoClientDetail({ workspaceSlug, clientId }: Props) {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useSWR(["PESPO_CLIENT", workspaceSlug, clientId], () =>
    pespoClientsService.detail(workspaceSlug, clientId)
  );
  const [renewing, setRenewing] = useState(false);
  const [renewal, setRenewal] = useState<TPespoContractInput>(emptyContract());
  const [keepBalance, setKeepBalance] = useState(true);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);

  if (error) return <p className="text-body-sm-regular text-danger-primary">{t("pespo_clients.error")}</p>;
  if (isLoading || !data)
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="96px" />
        <Loader.Item height="160px" />
      </Loader>
    );

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      setToast({ type: TOAST_TYPE.SUCCESS, title: success });
      await mutate();
      return true;
    } catch (err) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: clientErrorMessage(t, err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startRenewal = () => {
    setRenewal(renewalFrom(data.contract));
    setKeepBalance(true);
    setRenewing(true);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link
          href={`/${workspaceSlug}/settings/clients/`}
          className="flex w-fit items-center gap-1 text-body-xs-regular text-tertiary hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          {t("pespo_clients.back")}
        </Link>
        <h2 className="text-h5-medium text-primary">{data.name}</h2>
        {data.project && (
          <Link
            href={`/${workspaceSlug}/projects/${data.project.id}/issues/`}
            className="w-fit text-body-sm-regular text-accent-primary hover:underline"
          >
            {data.project.name} ({data.project.identifier})
          </Link>
        )}
      </div>

      {/* Contrato ativo e renovação */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-body-sm-medium text-primary">{t("project_settings.contract.current")}</h3>
          {!renewing && (
            <Button variant="secondary" size="sm" onClick={startRenewal}>
              {data.contract ? t("pespo_clients.renew.button") : t("pespo_clients.renew.new_contract")}
            </Button>
          )}
        </div>
        {data.contract ? (
          <div className="rounded-lg border border-subtle p-4">
            <p className="text-body-sm-regular text-secondary">
              {t("project_settings.contract.period", {
                type: data.contract.contract_type,
                start: renderFormattedDate(data.contract.start_date),
                end: renderFormattedDate(data.contract.end_date),
              })}
              {" · "}
              {t("project_settings.contract.urgent_limit", { count: data.contract.urgent_limit })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.contract.categories.map((category) => (
                <div key={category.category} className="rounded-md bg-layer-1 px-3 py-1.5">
                  <p className="text-caption-sm-regular text-tertiary">{category.category}</p>
                  <p className="text-body-sm-medium text-primary tabular-nums">
                    {category.contracted}
                    <span className="ml-1 text-caption-sm-regular text-tertiary">
                      {t("pespo_clients.left", { count: data.balance[category.category] ?? 0 })}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-body-sm-regular text-tertiary">{t("project_settings.contract.no_active")}</p>
        )}
        {renewing && (
          <div className="flex flex-col gap-4 rounded-lg border border-accent-subtle p-4">
            <h4 className="text-body-sm-medium text-primary">
              {data.contract ? t("pespo_clients.renew.title") : t("pespo_clients.renew.new_contract")}
            </h4>
            <ContractFields
              value={renewal}
              onChange={setRenewal}
              balance={data.contract && keepBalance ? data.balance : undefined}
            />
            {data.contract && (
              <div className="flex items-center gap-2">
                <ToggleSwitch value={keepBalance} onChange={() => setKeepBalance(!keepBalance)} size="sm" />
                <span className="text-body-xs-regular text-secondary">{t("pespo_clients.renew.keep_balance")}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRenewing(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => pespoClientsService.renew(workspaceSlug, clientId, { ...renewal, keep_balance: keepBalance }),
                    t("pespo_clients.renew.done")
                  ).then((ok) => ok && setRenewing(false))
                }
              >
                {t("pespo_clients.renew.submit")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Logins do cliente */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-sm-medium text-primary">{t("pespo_clients.logins.title")}</h3>
          <p className="text-body-xs-regular text-tertiary">{t("pespo_clients.logins.description")}</p>
        </div>
        {data.login_list.length > 0 && (
          <ul className="divide-y divide-subtle rounded-lg border border-subtle">
            {data.login_list.map((login) => (
              <li key={login.email} className="flex items-center gap-3 px-3 py-2 text-body-xs-regular">
                <span className="flex-1 truncate text-primary">{login.email}</span>
                <span
                  className={cn(
                    "rounded-sm px-1.5 text-caption-sm-medium",
                    login.status === "active" ? "bg-success-subtle text-success-primary" : "bg-layer-1 text-secondary"
                  )}
                >
                  {t(`pespo_clients.logins.${login.status}`)}
                </span>
                <button
                  type="button"
                  aria-label={t("pespo_clients.logins.remove")}
                  className="text-tertiary hover:text-danger-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => pespoClientsService.removeLogin(workspaceSlug, clientId, login.email),
                      t("pespo_clients.logins.removed")
                    )
                  }
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <TextArea
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            placeholder="ana@cliente.com.br"
            className="min-h-12 w-full resize-none text-body-sm-regular"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy || !emails.trim()}
              onClick={() =>
                void run(
                  () => pespoClientsService.addLogins(workspaceSlug, clientId, emails),
                  t("pespo_clients.logins.added")
                ).then((ok) => ok && setEmails(""))
              }
            >
              {t("pespo_clients.logins.add")}
            </Button>
          </div>
        </div>
      </section>

      {/* Histórico */}
      <section className="flex flex-col gap-3">
        <h3 className="text-body-sm-medium text-primary">{t("pespo_clients.history")}</h3>
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full min-w-[560px] text-body-xs-regular">
            <thead className="bg-layer-1 text-tertiary">
              <tr>
                <th className={cellClass}>{t("project_settings.contract.col_period")}</th>
                <th className={cellClass}>{t("project_settings.contract.col_type")}</th>
                <th className={cellClass}>{t("project_settings.contract.col_status")}</th>
                <th className={cellClass}>{t("project_settings.contract.col_categories")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {data.contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className={cn(cellClass, "text-primary")}>
                    {renderFormattedDate(contract.start_date)} – {renderFormattedDate(contract.end_date)}
                  </td>
                  <td className={cellClass}>{contract.contract_type}</td>
                  <td className={cellClass}>{t(`project_settings.contract.status_${contract.status ?? "active"}`)}</td>
                  <td className={cn(cellClass, "text-secondary")}>
                    {contract.categories.map((c) => `${c.category} ${c.contracted}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
});
