/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: Configurações › Equipe: os serviços (apps da Pespo) e as funções, cada uma com os serviços que vê e as
// pessoas da equipe que a têm. No lugar de Funcionários, Funções e Serviços do painel admin.
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TTeamRole, TTeamService } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { pespoTeamService } from "@/services/pespo-team.service";

const inputClass =
  "rounded-md border border-subtle bg-transparent px-2 py-1 text-body-xs-regular text-primary focus:border-accent-strong focus:outline-none";
const EMPTY_SERVICE = { icon: "🔧", name: "", url: "https://", description: "" };

type TT = (key: string, params?: Record<string, unknown>) => string;
const errorText = (t: TT, error: unknown) => {
  const code = (error as { code?: string } | undefined)?.code;
  const key = `pespo_team.errors.${code}`;
  const text = code ? t(key) : key;
  return text !== key ? text : t("common.something_went_wrong");
};

function ServiceRow(props: {
  service: TTeamService;
  onSave: (data: Partial<TTeamService>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { service, onSave, onDelete } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState(service);
  const dirty =
    draft.icon !== service.icon ||
    draft.name !== service.name ||
    draft.url !== service.url ||
    draft.description !== service.description;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        className={cn(inputClass, "w-12 text-center")}
        value={draft.icon}
        maxLength={4}
        aria-label={t("pespo_team.services.icon")}
        onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
      />
      <input
        className={cn(inputClass, "w-36")}
        value={draft.name}
        aria-label={t("pespo_team.services.name")}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
      <input
        className={cn(inputClass, "min-w-48 flex-1")}
        value={draft.url}
        aria-label={t("pespo_team.services.url")}
        onChange={(event) => setDraft({ ...draft, url: event.target.value })}
      />
      <input
        className={cn(inputClass, "min-w-48 flex-1")}
        value={draft.description}
        placeholder={t("pespo_team.services.description")}
        aria-label={t("pespo_team.services.description")}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />
      {dirty && (
        <Button variant="primary" size="sm" onClick={() => void onSave(draft)}>
          {t("save")}
        </Button>
      )}
      <button
        type="button"
        className="text-tertiary hover:text-danger-primary"
        aria-label={t("pespo_team.services.delete")}
        onClick={() => void onDelete()}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export const TeamSettingsRoot = observer(function TeamSettingsRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { data, isLoading, mutate } = useSWR(workspaceSlug ? ["TEAM_CATALOG", workspaceSlug] : null, () =>
    pespoTeamService.catalog(workspaceSlug)
  );
  const [newService, setNewService] = useState(EMPTY_SERVICE);
  const [newRole, setNewRole] = useState("");
  const teamIds = useMemo(
    () => (workspaceMemberIds ?? []).filter((id) => (getWorkspaceMemberDetails(id)?.role ?? 0) >= 15),
    [workspaceMemberIds, getWorkspaceMemberDetails]
  );

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await mutate();
      return true;
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: errorText(t, error) });
      return false;
    }
  };
  const updateRole = (role: TTeamRole, patch: Partial<TTeamRole>) =>
    run(() => pespoTeamService.updateRole(workspaceSlug, role.id, patch));

  if (isLoading || !data)
    return (
      <Loader className="flex flex-col gap-2">
        <Loader.Item height="40px" />
        <Loader.Item height="120px" />
      </Loader>
    );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-sm-medium text-primary">{t("pespo_team.services.title")}</h3>
          <p className="text-body-xs-regular text-tertiary">{t("pespo_team.services.hint")}</p>
        </div>
        <div className="divide-y divide-subtle rounded-lg border border-subtle">
          {data.services.map((service) => (
            <ServiceRow
              key={`${service.id}-${service.name}-${service.url}`}
              service={service}
              onSave={async (draft) => {
                await run(() => pespoTeamService.updateService(workspaceSlug, service.id, draft));
              }}
              onDelete={async () => {
                await run(() => pespoTeamService.deleteService(workspaceSlug, service.id));
              }}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2 bg-layer-1 px-3 py-2">
            <input
              className={cn(inputClass, "w-12 text-center")}
              value={newService.icon}
              maxLength={4}
              aria-label={t("pespo_team.services.icon")}
              onChange={(event) => setNewService({ ...newService, icon: event.target.value })}
            />
            <input
              className={cn(inputClass, "w-36")}
              value={newService.name}
              placeholder={t("pespo_team.services.name")}
              onChange={(event) => setNewService({ ...newService, name: event.target.value })}
            />
            <input
              className={cn(inputClass, "min-w-48 flex-1")}
              value={newService.url}
              aria-label={t("pespo_team.services.url")}
              onChange={(event) => setNewService({ ...newService, url: event.target.value })}
            />
            <input
              className={cn(inputClass, "min-w-48 flex-1")}
              value={newService.description}
              placeholder={t("pespo_team.services.description")}
              onChange={(event) => setNewService({ ...newService, description: event.target.value })}
            />
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              disabled={!newService.name.trim()}
              onClick={() =>
                void run(() =>
                  pespoTeamService.createService(workspaceSlug, {
                    ...newService,
                    sort_order: (data.services.at(-1)?.sort_order ?? 0) + 10,
                  })
                ).then((ok) => ok && setNewService(EMPTY_SERVICE))
              }
            >
              {t("pespo_team.services.add")}
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-body-sm-medium text-primary">{t("pespo_team.roles.title")}</h3>
          <p className="text-body-xs-regular text-tertiary">{t("pespo_team.roles.hint")}</p>
        </div>
        {data.roles.map((role) => (
          <div key={role.id} className="flex flex-col gap-3 rounded-lg border border-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body-sm-medium text-primary">{role.name}</span>
              <button
                type="button"
                className="text-tertiary hover:text-danger-primary"
                aria-label={t("pespo_team.roles.delete")}
                onClick={() => void run(() => pespoTeamService.deleteRole(workspaceSlug, role.id))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.services.map((service) => {
                const on = role.service_ids.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      void updateRole(role, {
                        service_ids: on
                          ? role.service_ids.filter((id) => id !== service.id)
                          : [...role.service_ids, service.id],
                      })
                    }
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-caption-sm-medium",
                      on
                        ? "border-accent-strong bg-accent-subtle text-primary"
                        : "border-subtle text-tertiary hover:text-primary"
                    )}
                  >
                    {service.icon} {service.name}
                  </button>
                );
              })}
            </div>
            <div className="w-fit rounded-md border border-subtle">
              <MemberDropdown
                memberIds={teamIds}
                value={role.member_ids}
                onChange={(memberIds: string[]) => void updateRole(role, { member_ids: memberIds })}
                multiple
                buttonVariant="transparent-with-text"
                placeholder={t("pespo_team.roles.members")}
              />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            className={cn(inputClass, "w-64")}
            value={newRole}
            placeholder={t("pespo_team.roles.new")}
            onChange={(event) => setNewRole(event.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!newRole.trim()}
            onClick={() =>
              void run(() => pespoTeamService.createRole(workspaceSlug, { name: newRole.trim() })).then(
                (ok) => ok && setNewRole("")
              )
            }
          >
            {t("pespo_team.roles.add")}
          </Button>
        </div>
      </section>
    </div>
  );
});
