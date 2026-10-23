/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { Globe, Search, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { WorkItemsIcon } from "@plane/propel/icons";
import type { IWorkspaceIssueSearchResult, TLinkEditableFields } from "@plane/types";
import { Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import type { TLinkOperations } from "./use-links";

const workspaceService = new WorkspaceService();
const SEARCH_DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;

export type TLinkOperationsModal = Exclude<TLinkOperations, "remove">;

export type TLinkCreateFormFieldOptions = TLinkEditableFields & {
  id?: string;
  issue?: string | null;
  issue_detail?: { id: string; name: string; project_id: string } | null;
};

export type TLinkCreateEditModal = {
  workspaceSlug: string;
  isModalOpen: boolean;
  handleOnClose?: () => void;
  linkOperations: TLinkOperationsModal;
  preloadedData?: TLinkCreateFormFieldOptions;
};

type TLinkKind = "site" | "work_item";
type TSelectedWorkItem = { id: string; name: string; project_id: string };

const defaultValues: TLinkCreateFormFieldOptions = {
  title: "",
  url: "",
};

export const LinkCreateUpdateModal = observer(function LinkCreateUpdateModal(props: TLinkCreateEditModal) {
  // props
  const { workspaceSlug, isModalOpen, handleOnClose, linkOperations, preloadedData } = props;
  // states
  const [kind, setKind] = useState<TLinkKind>("site");
  const [selectedWorkItem, setSelectedWorkItem] = useState<TSelectedWorkItem | null>(null);
  const [workItemError, setWorkItemError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IWorkspaceIssueSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  // react hook form
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    control,
    reset,
  } = useForm<TLinkCreateFormFieldOptions>({
    defaultValues,
  });
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  const onClose = () => {
    if (handleOnClose) handleOnClose();
  };

  const handleFormSubmit = async (formData: TLinkCreateFormFieldOptions) => {
    try {
      if (kind === "work_item") {
        // Pespo: link pra um item de trabalho — a URL é montada pelo servidor a partir do item
        if (!selectedWorkItem) {
          setWorkItemError(true);
          return;
        }
        const data = { title: formData.title, issue: selectedWorkItem.id };
        if (!formData.id) await linkOperations.create(data);
        else await linkOperations.update(formData.id, data);
      } else {
        const parsedUrl = formData.url.startsWith("http") ? formData.url : `http://${formData.url}`;
        if (!formData || !formData.id) await linkOperations.create({ title: formData.title, url: parsedUrl });
        else
          await linkOperations.update(formData.id, {
            title: formData.title,
            url: parsedUrl,
            // a link that pointed to a work item goes back to being a website
            ...(preloadedData?.issue ? { issue: null } : {}),
          });
      }
      onClose();
    } catch (error) {
      console.error("error", error);
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      const isWorkItemLink = !!preloadedData?.issue;
      reset({ ...defaultValues, ...preloadedData, url: isWorkItemLink ? "" : (preloadedData?.url ?? "") });
      setKind(isWorkItemLink ? "work_item" : "site");
      setSelectedWorkItem(preloadedData?.issue_detail ?? null);
      setWorkItemError(false);
      setSearchQuery("");
      setSearchResults([]);
    }
    return () => reset(defaultValues);
  }, [preloadedData, reset, isModalOpen]);

  // the search field takes the cursor when the work item option is picked
  useEffect(() => {
    if (isModalOpen && kind === "work_item" && !selectedWorkItem) searchInputRef.current?.focus();
  }, [isModalOpen, kind, selectedWorkItem]);

  // search work items in every project the person can see (same rules as the global search)
  useEffect(() => {
    if (kind !== "work_item" || !isModalOpen) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const search = async () => {
      setIsSearching(true);
      try {
        const response = await workspaceService.searchWorkspace(workspaceSlug, {
          search: query,
          workspace_search: true,
        });
        if (!cancelled) setSearchResults((response?.results?.issue ?? []).slice(0, MAX_RESULTS));
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };
    const timeout = setTimeout(() => void search(), SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [kind, isModalOpen, searchQuery, workspaceSlug]);

  const kindButtonClassName = (value: TLinkKind) =>
    cn("flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-13 font-medium", {
      "bg-surface-1 text-primary shadow-raised-100": kind === value,
      "text-tertiary hover:text-secondary": kind !== value,
    });

  return (
    <ModalCore isOpen={isModalOpen} handleClose={onClose}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="space-y-5 p-5">
          <h3 className="text-18 font-medium text-secondary">
            {preloadedData?.id ? t("update") : t("add")} {t("home.quick_links.title")}
          </h3>
          <div className="flex gap-1 rounded-md bg-layer-1 p-1">
            <button type="button" className={kindButtonClassName("site")} onClick={() => setKind("site")}>
              <Globe className="size-3.5" />
              {t("home.quick_links.kind_site")}
            </button>
            <button type="button" className={kindButtonClassName("work_item")} onClick={() => setKind("work_item")}>
              <WorkItemsIcon className="size-3.5" />
              {t("home.quick_links.kind_work_item")}
            </button>
          </div>
          <div className="mt-2 space-y-3">
            {kind === "site" ? (
              <div>
                <label htmlFor="url" className="mb-2 text-14 font-medium text-secondary">
                  {t("link.modal.url.text")}
                  <span className="block text-10">{t("required")}</span>
                </label>
                <Controller
                  control={control}
                  name="url"
                  rules={{
                    validate: (value) => kind !== "site" || !!value?.trim() || t("link.modal.url.required"),
                  }}
                  render={({ field: { value, onChange, ref } }) => (
                    <Input
                      id="url"
                      type="text"
                      value={value}
                      onChange={onChange}
                      ref={ref}
                      hasError={Boolean(errors.url)}
                      placeholder={t("link.modal.url.placeholder")}
                      className="w-full"
                    />
                  )}
                />
                {errors.url && <span className="text-11 text-danger-primary">{t("link.modal.url.required")}</span>}
              </div>
            ) : (
              <div>
                <label htmlFor="work-item-search" className="mb-2 text-14 font-medium text-secondary">
                  {t("home.quick_links.work_item")}
                  <span className="block text-10">{t("required")}</span>
                </label>
                {selectedWorkItem ? (
                  <div className="flex items-center gap-2 rounded-md border border-subtle px-2.5 py-2">
                    <WorkItemsIcon className="size-4 flex-shrink-0 text-tertiary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-13 text-primary">{selectedWorkItem.name}</div>
                      <div className="truncate text-11 text-placeholder">
                        {getProjectById(selectedWorkItem.project_id)?.name}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedWorkItem(null)}
                      className="grid size-6 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
                      aria-label={t("home.quick_links.change_work_item")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className={cn("flex items-center gap-2 rounded-md border px-2.5", {
                        "border-danger-strong": workItemError,
                        "border-subtle": !workItemError,
                      })}
                    >
                      <Search className="size-3.5 flex-shrink-0 text-placeholder" />
                      <input
                        id="work-item-search"
                        type="text"
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter picks the first result instead of submitting an empty form
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const first = searchResults[0];
                          if (first)
                            setSelectedWorkItem({ id: first.id, name: first.name, project_id: first.project_id });
                        }}
                        placeholder={t("home.quick_links.search_work_item")}
                        className="w-full bg-transparent py-2 text-13 text-primary outline-none placeholder:text-placeholder"
                      />
                    </div>
                    {workItemError && (
                      <span className="text-11 text-danger-primary">{t("home.quick_links.work_item_required")}</span>
                    )}
                    {searchQuery.trim() && (
                      <div className="mt-1 max-h-60 overflow-y-auto rounded-md border border-subtle">
                        {searchResults.length > 0 ? (
                          searchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => {
                                setSelectedWorkItem({
                                  id: result.id,
                                  name: result.name,
                                  project_id: result.project_id,
                                });
                                setWorkItemError(false);
                              }}
                              className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-layer-1"
                            >
                              <WorkItemsIcon className="size-3.5 flex-shrink-0 text-tertiary" />
                              <span className="min-w-0 flex-1 truncate text-13 text-primary">{result.name}</span>
                              <span className="max-w-[40%] flex-shrink-0 truncate text-11 text-placeholder">
                                {getProjectById(result.project_id)?.name ?? result.project__identifier}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="px-2.5 py-2 text-13 text-placeholder">
                            {isSearching ? t("home.quick_links.searching") : t("home.quick_links.no_work_items")}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div>
              <label htmlFor="title" className="mb-2 text-14 font-medium text-secondary">
                {t("link.modal.title.text")}
                <span className="block text-10">{t("optional")}</span>
              </label>
              <Controller
                control={control}
                name="title"
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="title"
                    type="text"
                    value={value ?? ""}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.title)}
                    placeholder={
                      kind === "work_item" ? t("home.quick_links.title_placeholder") : t("link.modal.title.placeholder")
                    }
                    className="w-full"
                  />
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {preloadedData?.id ? (isSubmitting ? t("updating") : t("update")) : isSubmitting ? t("adding") : t("add")}{" "}
            {t("home.quick_links.title")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
