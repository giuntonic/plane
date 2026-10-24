/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPieceCategory, TPieceRequestItem, TProjectPiecesPanel } from "@plane/types";
import { Checkbox, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// services
import { projectPiecesService } from "@/services/project-pieces.service";
// local imports
import { PIECE_CATEGORIES, pieceErrorMessage } from "./helpers";

const MAX_PER_REQUEST = 30;

type TLine = TPieceRequestItem & { key: number };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onRequested: () => void;
  workspaceSlug: string;
  projectId: string;
  panel: TProjectPiecesPanel;
};

/** Pespo: solicitar peças novas. O servidor confere de novo o saldo (mesmas regras do portal do cliente). */
export const PiecesRequestModal = observer(function PiecesRequestModal(props: Props) {
  const { isOpen, onClose, onRequested, workspaceSlug, projectId, panel } = props;
  const { t } = useTranslation();
  const firstCategory =
    (panel.availability.categories.find((row) => row.contracted > 0)?.category as TPieceCategory | undefined) ??
    PIECE_CATEGORIES[0];
  const [lines, setLines] = useState<TLine[]>([{ key: 0, category: firstCategory, quantity: 1 }]);
  const [briefing, setBriefing] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const available = Object.fromEntries(
    panel.availability.categories.map((row) => [row.category, Math.max(0, row.available)])
  );
  const requestedBy = (category: string) =>
    lines.filter((line) => line.category === category).reduce((sum, line) => sum + (line.quantity || 0), 0);
  const total = lines.reduce((sum, line) => sum + (line.quantity || 0), 0);
  const urgentRequested = lines.filter((line) => line.urgent).reduce((sum, line) => sum + (line.quantity || 0), 0);
  const urgentAvailable = Math.max(0, panel.availability.urgent.available);
  const overCategory = PIECE_CATEGORIES.find((category) => requestedBy(category) > (available[category] ?? 0));
  const problem =
    total === 0
      ? t("pieces_panel.request.empty")
      : total > MAX_PER_REQUEST
        ? t("pieces_panel.errors.TOO_MANY_PIECES", { max: MAX_PER_REQUEST })
        : overCategory
          ? t("pieces_panel.errors.NOT_ENOUGH", {
              category: overCategory,
              requested: requestedBy(overCategory),
              available: available[overCategory] ?? 0,
            })
          : urgentRequested > urgentAvailable
            ? t("pieces_panel.errors.NOT_ENOUGH_URGENT", { requested: urgentRequested, available: urgentAvailable })
            : null;

  const updateLine = (key: number, patch: Partial<TLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const handleClose = () => {
    setLines([{ key: 0, category: firstCategory, quantity: 1 }]);
    setBriefing("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await projectPiecesService.requestPieces(
        workspaceSlug,
        projectId,
        lines.map(({ key: _key, ...line }) => ({ ...line, desired_date: line.desired_date || null })),
        briefing
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("pieces_panel.request.success", { count: response.created.length }),
      });
      onRequested();
      handleClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("pieces_panel.request.error"),
        message: pieceErrorMessage(t, error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-18 font-medium text-secondary">{t("pieces_panel.request.title")}</h3>
            <p className="text-body-xs-regular text-tertiary">{t("pieces_panel.request.description")}</p>
          </div>

          <div className="flex flex-col gap-2">
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
                <select
                  value={line.category}
                  onChange={(e) => updateLine(line.key, { category: e.target.value as TPieceCategory })}
                  aria-label={t("pieces_panel.request.category")}
                  className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-medium text-primary"
                >
                  {PIECE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category} ({t("pieces_panel.request.available_short", { count: available[category] ?? 0 })})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                  aria-label={t("pieces_panel.request.quantity")}
                  className="h-8 w-16 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
                />
                <label className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
                  <Checkbox
                    checked={!!line.urgent}
                    onChange={(e) => updateLine(line.key, { urgent: e.target.checked })}
                  />
                  {t("pieces_panel.request.urgent")}
                </label>
                <label className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
                  <Checkbox
                    checked={!!line.needs_print}
                    onChange={(e) => updateLine(line.key, { needs_print: e.target.checked })}
                  />
                  {t("pieces_panel.request.needs_print")}
                </label>
                <label className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
                  {t("pieces_panel.request.desired_date")}
                  <input
                    type="date"
                    value={line.desired_date ?? ""}
                    onChange={(e) => updateLine(line.key, { desired_date: e.target.value || null })}
                    className="h-8 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary"
                  />
                </label>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                    aria-label={t("pieces_panel.request.remove_line")}
                    className="ml-auto grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-1"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { key: Math.max(...current.map((line) => line.key)) + 1, category: firstCategory, quantity: 1 },
                ])
              }
              className="flex w-fit items-center gap-1 text-body-xs-medium text-accent-primary hover:underline"
            >
              <Plus className="size-3.5" />
              {t("pieces_panel.request.add_line")}
            </button>
          </div>

          <TextArea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder={t("pieces_panel.request.briefing_placeholder")}
            className="min-h-24 w-full resize-none text-14"
          />

          <p className={cn("text-body-xs-regular", problem ? "text-danger-primary" : "text-tertiary")}>
            {problem ??
              t("pieces_panel.request.summary", {
                count: total,
                urgent: urgentRequested,
              })}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">
          <Button variant="secondary" size="lg" type="button" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={!!problem}>
            {t("pieces_panel.request.submit")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
