/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate } from "swr";
import type { TEntityTemplateKind } from "@plane/types";
// services
import { entityTemplateService } from "@/services/entity-template.service";

const KEY_PREFIX = "ENTITY_TEMPLATES";

export const getEntityTemplatesKey = (workspaceSlug: string, kind?: TEntityTemplateKind, projectId?: string) =>
  [KEY_PREFIX, workspaceSlug, kind ?? "all", projectId ?? "all"] as const;

/** Modelos de um tipo que valem em `projectId` (os do projeto e os do workspace); sem tipo, todos. */
export const useEntityTemplates = (workspaceSlug: string | undefined, kind?: TEntityTemplateKind, projectId?: string) =>
  useSWR(workspaceSlug ? getEntityTemplatesKey(workspaceSlug, kind, projectId) : null, () =>
    entityTemplateService.list(workspaceSlug as string, {
      ...(kind ? { kind } : {}),
      ...(projectId ? { project_id: projectId } : {}),
    })
  );

/** Depois de criar, renomear ou apagar: todas as listas de modelos do workspace buscam de novo. */
export const revalidateEntityTemplates = (workspaceSlug: string) =>
  mutate((key) => Array.isArray(key) && key[0] === KEY_PREFIX && key[1] === workspaceSlug);
