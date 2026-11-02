/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ChevronRight, Folder, FolderPlus, HardDrive } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
// components
import { getAcervoErrorKey } from "@/components/issues/issue-detail-widgets/acervo/helper";
// services
import { acervoService } from "@/services/acervo.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => Promise<void>;
};

/** Pespo: seletor de pasta do Acervo (Nextcloud) para a pasta do projeto. Navega pelas pastas e cria uma nova. */
export const AcervoFolderPickerModal = observer(function AcervoFolderPickerModal(props: Props) {
  const { workspaceSlug, projectId, isOpen, initialPath, onClose, onSelect } = props;
  const { t } = useTranslation();
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { data, error, isLoading, mutate } = useSWR(
    isOpen ? ["ACERVO_BROWSE", projectId, path ?? ""] : null,
    () => acervoService.browse(workspaceSlug, projectId, path),
    { revalidateOnFocus: false }
  );

  const close = () => {
    setPath(initialPath);
    setNewName("");
    onClose();
  };

  const showError = (err: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getAcervoErrorKey(err)) });

  const createHere = async () => {
    if (!data || !newName.trim()) return;
    try {
      const folder = await acervoService.createFolder(workspaceSlug, projectId, data.path, newName.trim());
      setNewName("");
      await mutate();
      setPath(folder.path);
    } catch (err) {
      showError(err);
    }
  };

  const choose = async () => {
    if (!data?.selectable) return;
    setIsSaving(true);
    try {
      await onSelect(data.path);
      close();
    } finally {
      setIsSaving(false);
    }
  };

  const parts = (data?.path ?? "").split("/").filter(Boolean);
  const crumbs = parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }));

  return (
    <ModalCore preventOutsideClick isOpen={isOpen} handleClose={close} width={EModalWidth.XL}>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <HardDrive className="size-4 text-secondary" />
        <h3 className="text-h5-medium text-primary">{t("project_settings.features.acervo.picker_title")}</h3>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-4">
        <nav
          aria-label={t("project_settings.features.acervo.current_folder")}
          className="flex flex-wrap items-center gap-1 text-body-xs-regular text-tertiary"
        >
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3" />}
              <button
                type="button"
                className="hover:text-primary disabled:text-primary"
                disabled={index === crumbs.length - 1}
                onClick={() => setPath(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="max-h-72 min-h-40 overflow-y-auto rounded-md border border-subtle">
          {isLoading ? (
            <Loader className="space-y-2 p-3">
              <Loader.Item height="28px" />
              <Loader.Item height="28px" />
              <Loader.Item height="28px" />
            </Loader>
          ) : error ? (
            <p className="p-3 text-body-xs-regular text-danger-primary">{t(getAcervoErrorKey(error))}</p>
          ) : data && data.folders.length === 0 ? (
            <p className="p-3 text-body-xs-regular text-tertiary">
              {t("project_settings.features.acervo.empty_folder")}
            </p>
          ) : (
            <ul className="flex flex-col py-1">
              {data?.folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    onClick={() => setPath(folder.path)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-xs-regular text-primary hover:bg-layer-transparent-hover"
                  >
                    <Folder className="size-3.5 flex-shrink-0 text-tertiary" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createHere();
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t("project_settings.features.acervo.new_folder_placeholder")}
            aria-label={t("project_settings.features.acervo.new_folder_placeholder")}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            prependIcon={<FolderPlus />}
            disabled={!newName.trim() || !data}
          >
            {t("project_settings.features.acervo.new_folder")}
          </Button>
        </form>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={close}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void choose()}
          disabled={!data?.selectable || isSaving}
          loading={isSaving}
        >
          {data?.selectable
            ? t("project_settings.features.acervo.use_folder", { name: parts[parts.length - 1] })
            : t("project_settings.features.acervo.open_a_folder")}
        </Button>
      </div>
    </ModalCore>
  );
});
