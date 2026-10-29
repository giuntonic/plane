/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { ModalCore } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// components
import { getCardExtrasKey } from "@/components/issues/card-extras";
import { getIssueChecklistKey } from "@/components/issues/issue-detail-widgets/checklist/helper";
import { ParentIssuesListModal } from "@/components/issues/parent-issues-list-modal";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { IssueChecklistService } from "@/services/issue-checklist.service";
// local imports
import { convertToChecklistModalStore } from "./store";

const issueChecklistService = new IssueChecklistService();

type TTarget = { id: string; name: string; projectId: string; sequenceId: number };

type Props = { workspaceSlug: string };

/** Pespo: um item de trabalho vira subtarefa (linha do checklist) de outro item, o pai por padrão. */
export const ConvertToChecklistModal = observer(function ConvertToChecklistModal(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const router = useAppRouter();
  const { workItem: workItemFromRoute } = useParams();
  const { request, close } = convertToChecklistModalStore;
  const {
    issue: { getIssueById, getIssueIdByIdentifier, fetchIssue },
    subIssues: { fetchSubIssues },
    peekIssue,
    setPeekIssue,
  } = useIssueDetail();
  const { getProjectIdentifierById } = useProject();
  const { issues: projectIssues } = useIssues(EIssuesStoreType.PROJECT);
  const { issues: cycleIssues } = useIssues(EIssuesStoreType.CYCLE);
  const { issues: moduleIssues } = useIssues(EIssuesStoreType.MODULE);
  const [target, setTarget] = useState<TTarget | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issue = request ? getIssueById(request.issueId) : undefined;

  // Destino padrão: o informado (menu da lista de sub-itens) ou o pai do item.
  useEffect(() => {
    if (!request) return;
    const current = getIssueById(request.issueId);
    const defaultTarget = getIssueById(request.targetIssueId ?? current?.parent_id ?? "");
    setTarget(
      defaultTarget?.project_id
        ? {
            id: defaultTarget.id,
            name: defaultTarget.name,
            projectId: defaultTarget.project_id,
            sequenceId: defaultTarget.sequence_id,
          }
        : null
    );
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- só ao abrir
  }, [request]);

  if (!request || !issue?.project_id) return null;
  const projectId = issue.project_id;
  const hasSubItems = (issue.sub_issues_count ?? 0) > 0;

  const handlePick = (picked: ISearchIssueResponse) =>
    setTarget({ id: picked.id, name: picked.name, projectId: picked.project_id, sequenceId: picked.sequence_id });

  const handleSubmit = async () => {
    if (!target || hasSubItems || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await issueChecklistService.convertToChecklist(workspaceSlug, projectId, issue.id, target.id);
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_structure.to_checklist.error"),
        message:
          code === "HAS_SUB_WORK_ITEMS"
            ? t("work_item_structure.to_checklist.has_sub_items")
            : code === "FORBIDDEN"
              ? t("work_item_structure.to_checklist.forbidden")
              : undefined,
      });
      setIsSubmitting(false);
      return;
    }

    // O item já saiu no servidor: tira das listas abertas e atualiza o destino (checklist e contadores).
    for (const store of [projectIssues, cycleIssues, moduleIssues]) store.removeIssueFromList(issue.id);
    await Promise.allSettled([
      issue.parent_id ? fetchSubIssues(workspaceSlug, projectId, issue.parent_id) : Promise.resolve(),
      fetchIssue(workspaceSlug, target.projectId, target.id),
      mutate(getIssueChecklistKey(target.id)),
      mutate(getCardExtrasKey(target.projectId)),
      mutate(getCardExtrasKey(projectId)),
    ]);
    // Se o item estava aberto (painel ou página), abre o destino, onde a subtarefa nova está.
    if (peekIssue?.issueId === issue.id)
      setPeekIssue({ workspaceSlug, projectId: target.projectId, issueId: target.id });
    const routeIssueId = workItemFromRoute ? getIssueIdByIdentifier(workItemFromRoute.toString()) : undefined;
    if (routeIssueId === issue.id)
      router.push(
        generateWorkItemLink({
          workspaceSlug,
          projectId: target.projectId,
          issueId: target.id,
          projectIdentifier: getProjectIdentifierById(target.projectId),
          sequenceId: target.sequenceId,
        })
      );
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("work_item_structure.to_checklist.success", { target: target.name }),
    });
    setIsSubmitting(false);
    close();
  };

  return (
    <ModalCore isOpen handleClose={close} preventOutsideClick>
      <div className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="text-18 font-medium text-secondary">{t("work_item_structure.to_checklist.title")}</h3>
          <p className="text-body-xs-regular text-tertiary">
            {t("work_item_structure.to_checklist.description", { name: issue.name })}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-body-xs-medium text-secondary">{t("work_item_structure.to_checklist.target")}</span>
          <div className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-body-sm-regular text-primary">
              <ListChecks className="size-4 flex-shrink-0 text-tertiary" />
              <span className="truncate">{target?.name ?? t("work_item_structure.to_checklist.choose_target")}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => setIsPicking(true)}>
              {target
                ? t("work_item_structure.to_checklist.change_target")
                : t("work_item_structure.to_checklist.choose_target")}
            </Button>
          </div>
        </div>

        {hasSubItems ? (
          <p className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-body-xs-regular text-danger-primary">
            <AlertTriangle className="mt-0.5 size-3.5 flex-shrink-0" />
            {t("work_item_structure.to_checklist.has_sub_items")}
          </p>
        ) : (
          <div className="space-y-1.5 text-body-xs-regular">
            <p className="text-secondary">{t("work_item_structure.to_checklist.keeps")}</p>
            <p className="flex items-start gap-2 text-warning-primary">
              <AlertTriangle className="mt-0.5 size-3.5 flex-shrink-0" />
              {t("work_item_structure.to_checklist.loses")}
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={close}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={!target || hasSubItems}
          onClick={() => void handleSubmit()}
        >
          {t("work_item_structure.to_checklist.submit")}
        </Button>
      </div>
      <ParentIssuesListModal
        isOpen={isPicking}
        handleClose={() => setIsPicking(false)}
        onChange={handlePick}
        projectId={projectId}
        issueId={issue.id}
      />
    </ModalCore>
  );
});
