/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: "Relatórios": horas, o mês de um cliente e a carga da equipe. A aba fica no endereço (?tab=).
import { observer } from "mobx-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { MonthlyClientReport } from "./monthly-client";
import { TimeReportRoot } from "./root";
import { TeamWorkloadReport } from "./workload";

const TABS = ["hours", "client", "workload"] as const;
type TTab = (typeof TABS)[number];

export const ReportsRoot = observer(function ReportsRoot() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") as TTab | null;
  const tab: TTab = requested && TABS.includes(requested) ? requested : "hours";

  return (
    <div className="vertical-scrollbar scrollbar-md size-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-h4-medium text-primary">{t("pespo_reports.title")}</h2>
          <div className="flex gap-4 border-b border-subtle">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => router.replace(`${pathname}?tab=${key}`)}
                className={cn(
                  "-mb-px border-b-2 pb-2 text-body-sm-medium",
                  tab === key
                    ? "border-accent-strong text-primary"
                    : "border-transparent text-tertiary hover:text-primary"
                )}
              >
                {t(`pespo_reports.tabs.${key}`)}
              </button>
            ))}
          </div>
        </div>
        {tab === "hours" && <TimeReportRoot />}
        {tab === "client" && <MonthlyClientReport />}
        {tab === "workload" && <TeamWorkloadReport />}
      </div>
    </div>
  );
});
