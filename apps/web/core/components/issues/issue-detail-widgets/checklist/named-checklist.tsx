/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ListTodo, Pencil, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssueChecklist, TIssueChecklistItem } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn, countCompletedChecklistItems } from "@plane/utils";
// components
import type { TChecklistTreeLabels, TChecklistTreeNode } from "@/components/checklist-tree";
import { ChecklistTreeList } from "@/components/checklist-tree";
// local imports
import { IssueChecklistItemExtras } from "./extras";
import { consumePendingChecklistRename, useIssueChecklistOperations } from "./helper";

// Recolhida ou não, por checklist, só neste navegador.
const collapsedKey = (checklistId: string) => `pespo-hub:checklist-collapsed:${checklistId}`;
const readCollapsed = (checklistId: string) => {
  try {
    return window.localStorage.getItem(collapsedKey(checklistId)) === "1";
  } catch {
    return false;
  }
};
const writeCollapsed = (checklistId: string, collapsed: boolean) => {
  try {
    if (collapsed) window.localStorage.setItem(collapsedKey(checklistId), "1");
    else window.localStorage.removeItem(collapsedKey(checklistId));
  } catch {
    // sem localStorage (janela privada etc.): só não lembra
  }
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  checklist: TIssueChecklist;
  disabled: boolean;
  labels: TChecklistTreeLabels;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

/** Pespo: uma checklist com nome do item ("Aprovação", "Entrega"…), com as linhas dela em árvore. */
export const IssueNamedChecklist = observer(function IssueNamedChecklist(props: Props) {
  const { workspaceSlug, projectId, issueId, checklist, disabled, labels, onRename, onDelete } = props;
  const { t } = useTranslation();
  const operations = useIssueChecklistOperations(workspaceSlug, projectId, issueId, checklist.id);
  const [isEditing, setIsEditing] = useState(() => !disabled && consumePendingChecklistRename(checklist.id));
  const [name, setName] = useState(checklist.name);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => readCollapsed(checklist.id));
  const inputRef = useRef<HTMLInputElement>(null);
  const completed = countCompletedChecklistItems(operations.items);

  useEffect(() => {
    if (!isEditing) setName(checklist.name);
  }, [checklist.name, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const listLabels = useMemo(
    () => ({
      ...labels,
      addLine: t("issue_checklist.named.add_line"),
      placeholder: t("issue_checklist.named.placeholder"),
    }),
    [labels, t]
  );

  const commitName = () => {
    setIsEditing(false);
    const next = name.trim();
    if (!next) {
      setName(checklist.name);
      return;
    }
    if (next !== checklist.name) void onRename(next);
  };

  const toggleCollapsed = () => {
    setIsCollapsed((current) => {
      writeCollapsed(checklist.id, !current);
      return !current;
    });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
    setIsDeleteOpen(false);
  };

  const renderItemExtras = (item: TChecklistTreeNode) => (
    <IssueChecklistItemExtras
      item={item as TIssueChecklistItem}
      projectId={projectId}
      disabled={disabled}
      operations={operations}
    />
  );

  return (
    <section className="flex flex-col gap-1 border-t border-subtle pt-2">
      <div className="group/named-checklist flex items-center gap-2 px-2.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? labels.expand : labels.collapse}
          title={isCollapsed ? labels.expand : labels.collapse}
          className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", { "rotate-90": !isCollapsed })} />
        </button>
        <ListTodo className="size-4 flex-shrink-0 text-tertiary" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setName(checklist.name);
                setIsEditing(false);
              }
            }}
            placeholder={t("issue_checklist.named.name_placeholder")}
            aria-label={t("issue_checklist.named.name_placeholder")}
            className="min-w-0 flex-1 rounded-sm border border-strong bg-surface-1 px-1.5 py-0.5 text-body-sm-medium text-primary outline-none"
          />
        ) : (
          // clicar no nome também recolhe/abre a lista (renomear fica no lápis)
          <button type="button" onClick={toggleCollapsed} className="min-w-0 text-left">
            <h4 className="truncate text-body-sm-medium text-primary">{checklist.name}</h4>
          </button>
        )}
        <span className="flex-shrink-0 text-body-xs-regular text-tertiary tabular-nums">
          {completed}/{operations.items.length}
        </span>
        {!disabled && !isEditing && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/named-checklist:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label={t("issue_checklist.named.rename")}
              title={t("issue_checklist.named.rename")}
              className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              aria-label={t("issue_checklist.named.delete")}
              title={t("issue_checklist.named.delete")}
              className="grid size-6 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {isCollapsed ? (
        <div className="pb-1" />
      ) : (
        <ChecklistTreeList
          scopeId={`${issueId}:${checklist.id}`}
          disabled={disabled}
          operations={operations}
          labels={listLabels}
          renderItemExtras={renderItemExtras}
          className="px-1.5 pb-2"
        />
      )}
      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={t("issue_checklist.named.delete_title")}
        content={t("issue_checklist.named.delete_content", { name: checklist.name, count: operations.items.length })}
      />
    </section>
  );
});
