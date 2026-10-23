/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
// constants
import { EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// plane types
import { Button } from "@plane/propel/button";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
// plane ui
import { Breadcrumbs, Header } from "@plane/ui";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { EntityTemplateSelect } from "@/components/entity-templates/template-select";
import { entityTemplateService } from "@/services/entity-template.service";
import { EPageStoreType, usePageStore } from "@/hooks/store";

export const PagesListHeader = observer(function PagesListHeader() {
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // router
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type");
  // store hooks
  const { currentProjectDetails, loader } = useProject();
  const { canCurrentUserCreatePage, createPage } = usePageStore(EPageStoreType.PROJECT);
  const { t } = useTranslation();
  // handle page create
  const handleCreatePage = async () => {
    setIsCreatingPage(true);

    const payload: Partial<TPage> = {
      access: pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC,
    };

    await createPage(payload)
      // oxlint-disable-next-line promise/always-return
      .then((res) => {
        const pageId = `/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/${res?.id}`;
        router.push(pageId);
      })
      .catch((err) => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: err?.data?.error || t("create_error"),
        });
      })
      .finally(() => setIsCreatingPage(false));
  };

  // Pespo: página nova a partir de um modelo (o servidor cria com o conteúdo do modelo).
  const handleCreateFromTemplate = async (templateId: string | null) => {
    if (!templateId || !workspaceSlug || !projectId) return;
    setIsCreatingPage(true);
    try {
      const res = await entityTemplateService.apply(workspaceSlug.toString(), templateId, {
        project_id: projectId.toString(),
      });
      router.push(`/${workspaceSlug}/projects/${projectId}/pages/${res.page_id}`);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("entity_templates.apply_error.page") });
    } finally {
      setIsCreatingPage(false);
    }
  };

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs isLoading={loader === "init-loader"}>
          <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("common.pages")}
                href={`/${workspaceSlug}/projects/${currentProjectDetails?.id}/pages/`}
                icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      {canCurrentUserCreatePage && (
        <Header.RightItem>
          <EntityTemplateSelect
            workspaceSlug={workspaceSlug?.toString()}
            kind="page"
            projectId={projectId?.toString()}
            value={null}
            onChange={(id) => void handleCreateFromTemplate(id)}
            disabled={isCreatingPage}
            className="h-8"
          />
          <Button variant="primary" size="lg" onClick={handleCreatePage} loading={isCreatingPage}>
            {isCreatingPage ? t("common.adding") : t("add_page")}
          </Button>
        </Header.RightItem>
      )}
    </Header>
  );
});
