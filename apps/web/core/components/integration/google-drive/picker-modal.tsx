/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ChevronRight, FilePlus2, Folder, HardDrive, Search } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TGoogleDriveCreatableKind, TGoogleDriveFile, TGoogleDriveView } from "@plane/types";
import { EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
// hooks
import useDebounce from "@/hooks/use-debounce";
// services
import { googleDriveService } from "@/services/google-drive.service";
// local imports
import { getCurrentPathForRedirect, getGoogleDriveErrorKey } from "./helpers";

export const GOOGLE_DRIVE_STATUS_SWR_KEY = "google-drive-status";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the chosen file; the modal shows a loading state until it settles. */
  onSelect: (file: TGoogleDriveFile) => Promise<void> | void;
  title?: string;
  /** Show the "New Google Docs/Sheets/Slides" actions. */
  allowCreate?: boolean;
};

type TFolderCrumb = { id: string; name: string };

const VIEWS: { key: TGoogleDriveView; i18n: string }[] = [
  { key: "my_drive", i18n: "google_drive_integration.picker.my_drive" },
  { key: "shared", i18n: "google_drive_integration.picker.shared" },
  { key: "recent", i18n: "google_drive_integration.picker.recent" },
  { key: "starred", i18n: "google_drive_integration.picker.starred" },
];

const CREATE_OPTIONS: { kind: TGoogleDriveCreatableKind; i18n: string }[] = [
  { kind: "document", i18n: "google_drive_integration.picker.new_document" },
  { kind: "spreadsheet", i18n: "google_drive_integration.picker.new_spreadsheet" },
  { kind: "presentation", i18n: "google_drive_integration.picker.new_presentation" },
];

// Pespo: navegador de arquivos do Google Drive usado pelo widget do item de
// trabalho e pelo embed do editor (via GoogleDrivePickerHost). Fala só com o
// backend do Plane, que usa o token OAuth do próprio usuário.
export const GoogleDrivePickerModal = observer(function GoogleDrivePickerModal(props: Props) {
  const { isOpen, onClose, onSelect, title, allowCreate = false } = props;
  const { t } = useTranslation();
  // state
  const [view, setView] = useState<TGoogleDriveView>("my_drive");
  const [folders, setFolders] = useState<TFolderCrumb[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [files, setFiles] = useState<TGoogleDriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<TGoogleDriveCreatableKind | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const requestIdRef = useRef(0);
  const newFileNameRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(searchQuery.trim(), 400);
  // status
  const { data: status, isLoading: isStatusLoading } = useSWR(isOpen ? GOOGLE_DRIVE_STATUS_SWR_KEY : null, () =>
    googleDriveService.status()
  );
  const isConnected = !!status?.connected;
  const currentFolder = folders.at(-1);

  const fetchFiles = useCallback(
    async (pageToken?: string) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      try {
        const response = await googleDriveService.listFiles({
          view,
          search: debouncedSearch || undefined,
          folder_id: currentFolder?.id,
          page_token: pageToken,
        });
        // A newer request (folder/tab/search change) superseded this one.
        if (requestId !== requestIdRef.current) return;
        setFiles((prev) => (pageToken ? [...prev, ...response.files] : response.files));
        setNextPageToken(response.next_page_token);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setFiles([]);
        setNextPageToken(null);
        setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleDriveErrorKey(error)) });
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [view, debouncedSearch, currentFolder?.id, t]
  );

  useEffect(() => {
    if (isOpen && isConnected) void fetchFiles();
  }, [isOpen, isConnected, fetchFiles]);

  useEffect(() => {
    if (createKind) newFileNameRef.current?.focus();
  }, [createKind]);

  const resetAndClose = () => {
    if (selectingId || isCreating) return;
    setFolders([]);
    setSearchQuery("");
    setCreateKind(null);
    setNewFileName("");
    onClose();
  };

  const handleSelect = async (file: TGoogleDriveFile) => {
    if (file.is_folder) {
      setSearchQuery("");
      setFolders((prev) => [...prev, { id: file.id, name: file.name }]);
      return;
    }
    setSelectingId(file.id);
    try {
      await onSelect(file);
    } finally {
      setSelectingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createKind || !newFileName.trim()) return;
    setIsCreating(true);
    try {
      const file = await googleDriveService.createFile({
        kind: createKind,
        name: newFileName.trim(),
        parent_id: currentFolder?.id,
      });
      setCreateKind(null);
      setNewFileName("");
      await onSelect(file);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t(getGoogleDriveErrorKey(error)) });
    } finally {
      setIsCreating(false);
    }
  };

  const renderBody = () => {
    if (isStatusLoading || !status) {
      return (
        <Loader className="space-y-2 p-5">
          <Loader.Item height="36px" />
          <Loader.Item height="36px" />
          <Loader.Item height="36px" />
        </Loader>
      );
    }

    if (!isConnected) {
      return (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <HardDrive className="size-8 text-tertiary" />
          <h4 className="text-body-md-medium text-primary">{t("google_drive_integration.not_connected_title")}</h4>
          <p className="max-w-sm text-body-sm-regular text-secondary">
            {t("google_drive_integration.not_connected_description")}
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => (window.location.href = googleDriveService.getConnectUrl(getCurrentPathForRedirect()))}
          >
            {t("google_drive_integration.connect")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 px-5 pb-4">
        <div className="flex flex-wrap items-center gap-1 border-b border-subtle">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setView(option.key);
                setFolders([]);
              }}
              className={cn("-mb-px border-b-2 px-2 py-1.5 text-body-xs-medium", {
                "border-accent-primary text-primary": view === option.key && !debouncedSearch,
                "border-transparent text-tertiary hover:text-secondary": view !== option.key || !!debouncedSearch,
              })}
            >
              {t(option.i18n)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-placeholder" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("google_drive_integration.picker.search_placeholder")}
              className="w-full pl-7"
            />
          </div>
        </div>

        {folders.length > 0 && !debouncedSearch && (
          <div className="flex flex-wrap items-center gap-1 text-body-xs-regular text-tertiary">
            <button type="button" className="hover:text-primary" onClick={() => setFolders([])}>
              {t(VIEWS.find((v) => v.key === view)?.i18n ?? "google_drive_integration.picker.my_drive")}
            </button>
            {folders.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <button
                  type="button"
                  className={cn("max-w-40 truncate hover:text-primary", {
                    "text-primary": index === folders.length - 1,
                  })}
                  onClick={() => setFolders((prev) => prev.slice(0, index + 1))}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="vertical-scrollbar scrollbar-sm h-80 overflow-y-auto rounded-md border border-subtle">
          {isLoading && files.length === 0 ? (
            <Loader className="space-y-1 p-2">
              {["a", "b", "c", "d", "e", "f"].map((key) => (
                <Loader.Item key={key} height="36px" />
              ))}
            </Loader>
          ) : files.length === 0 ? (
            <div className="grid h-full place-items-center text-body-sm-regular text-tertiary">
              {t("google_drive_integration.picker.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-subtle">
              {files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    disabled={!!selectingId}
                    onClick={() => void handleSelect(file)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-layer-transparent-hover disabled:opacity-60",
                      { "bg-layer-transparent-active": selectingId === file.id }
                    )}
                  >
                    {file.is_folder ? (
                      <Folder className="size-4 flex-shrink-0 text-tertiary" />
                    ) : file.icon_link ? (
                      <img src={file.icon_link} alt="" className="size-4 flex-shrink-0" />
                    ) : (
                      <HardDrive className="size-4 flex-shrink-0 text-tertiary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm-medium text-primary">{file.name}</span>
                      {file.modified_time && (
                        <span className="block truncate text-caption-sm-regular text-tertiary">
                          {t("google_drive_integration.picker.modified", {
                            date: renderFormattedDate(file.modified_time) ?? "",
                          })}
                          {file.owner_name ? ` · ${file.owner_name}` : ""}
                        </span>
                      )}
                    </span>
                    {file.is_folder && <ChevronRight className="size-3.5 flex-shrink-0 text-tertiary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextPageToken && (
            <div className="flex justify-center p-2">
              <Button variant="ghost" size="base" loading={isLoading} onClick={() => void fetchFiles(nextPageToken)}>
                {t("google_drive_integration.picker.load_more")}
              </Button>
            </div>
          )}
        </div>

        {allowCreate &&
          (createKind ? (
            <form onSubmit={handleCreate} className="flex items-center gap-2">
              <Input
                ref={newFileNameRef}
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={t("google_drive_integration.picker.new_file_name")}
                className="flex-1"
              />
              <Button variant="secondary" size="lg" onClick={() => setCreateKind(null)} disabled={isCreating}>
                {t("google_drive_integration.picker.cancel")}
              </Button>
              <Button variant="primary" size="lg" type="submit" loading={isCreating} disabled={!newFileName.trim()}>
                {t("google_drive_integration.picker.create")}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {CREATE_OPTIONS.map((option) => (
                <Button
                  key={option.kind}
                  variant="secondary"
                  size="base"
                  prependIcon={<FilePlus2 />}
                  onClick={() => setCreateKind(option.kind)}
                >
                  {t(option.i18n)}
                </Button>
              ))}
            </div>
          ))}
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={resetAndClose} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <h3 className="flex items-center gap-2 text-h5-medium text-primary">
          <HardDrive className="size-4" />
          {title ?? t("google_drive_integration.picker.title")}
        </h3>
        {status?.connected && (
          <span className="truncate text-caption-sm-regular text-tertiary">{status.google_email}</span>
        )}
      </div>
      {renderBody()}
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-3">
        <Button variant="secondary" size="lg" onClick={resetAndClose}>
          {t("google_drive_integration.picker.cancel")}
        </Button>
      </div>
    </ModalCore>
  );
});
