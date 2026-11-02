/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: os campos do contrato (novo cliente e renovação): tipo, período, urgentes e peças por categoria.
import { useTranslation } from "@plane/i18n";
import type { TPespoContractInput } from "@plane/types";
import { cn } from "@plane/utils";
import { PIECE_CATEGORIES } from "./helpers";

export const inputClass =
  "rounded-md border border-subtle bg-transparent px-2 py-1 text-body-sm-regular text-primary focus:border-accent-strong focus:outline-none";

type Props = {
  value: TPespoContractInput;
  onChange: (value: TPespoContractInput) => void;
  /** Quanto sobrou do contrato anterior, mostrado ao lado de cada categoria (renovação com saldo). */
  balance?: Record<string, number>;
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-body-xs-medium text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function ContractFields({ value, onChange, balance }: Props) {
  const { t } = useTranslation();
  const change = (patch: Partial<TPespoContractInput>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Field label={t("pespo_clients.contract.type")}>
          <div className="flex gap-1">
            {(["FEE", "FEP"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => change({ contract_type: type })}
                className={cn(
                  "rounded-md border px-3 py-1 text-body-xs-medium",
                  value.contract_type === type
                    ? "border-accent-strong bg-accent-subtle text-primary"
                    : "border-subtle text-tertiary hover:text-primary"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("pespo_clients.contract.start")}>
          <input
            type="date"
            className={inputClass}
            value={value.start_date}
            onChange={(event) => change({ start_date: event.target.value })}
          />
        </Field>
        <Field label={t("pespo_clients.contract.end")}>
          <input
            type="date"
            className={inputClass}
            value={value.end_date}
            onChange={(event) => change({ end_date: event.target.value })}
          />
        </Field>
        <Field label={t("pespo_clients.contract.urgent_limit")}>
          <input
            type="number"
            min={0}
            max={100}
            className={cn(inputClass, "w-20")}
            value={value.urgent_limit}
            onChange={(event) => change({ urgent_limit: Number(event.target.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-body-xs-medium text-secondary">{t("pespo_clients.contract.quantities")}</span>
        <div className="flex flex-wrap gap-3">
          {PIECE_CATEGORIES.map((category) => (
            <label key={category} className="flex flex-col gap-1">
              <span className="text-caption-sm-regular text-tertiary">{category}</span>
              <input
                type="number"
                min={0}
                max={10000}
                className={cn(inputClass, "w-20")}
                value={value.quantities[category] ?? 0}
                onChange={(event) =>
                  change({ quantities: { ...value.quantities, [category]: Number(event.target.value) } })
                }
              />
              {balance && (balance[category] ?? 0) > 0 && (
                <span className="text-caption-sm-regular text-success-primary">
                  {t("pespo_clients.renew.plus_balance", { count: balance[category] })}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
