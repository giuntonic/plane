/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Pespo: modelos de item de trabalho, módulo, ciclo, página e projeto (…/workspaces/<slug>/templates/…).

export type TEntityTemplateKind = "work_item" | "module" | "cycle" | "page" | "project";

export type TWorkItemTemplatePrefill = {
  name: string;
  description_html: string;
  priority: string;
  label_ids: string[];
  assignee_ids: string[];
  estimate_point: string | null;
};

export type TModuleCycleTemplatePrefill = {
  name: string;
  description: string;
  /** Dias entre o início e o fim do original, para sugerir o fim a partir do início escolhido. */
  duration_days: number | null;
};

export type TPageTemplatePrefill = { name: string };

export type TEntityTemplate = {
  id: string;
  workspace: string;
  /** null = disponível em todos os projetos do workspace. */
  project: string | null;
  kind: TEntityTemplateKind;
  name: string;
  description: string;
  summary: { work_items: number; states?: number; labels?: number; modules?: number };
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Só no GET do detalhe com `project_id`. */
  prefill?: Partial<TWorkItemTemplatePrefill & TModuleCycleTemplatePrefill & TPageTemplatePrefill>;
};

export type TEntityTemplateCreatePayload = {
  kind: TEntityTemplateKind;
  source_id: string;
  name?: string;
  description?: string;
  /** Padrão: true (só no projeto de origem). Ignorado em modelos de projeto. */
  project_only?: boolean;
  /** Só modelos de projeto: false guarda só a estrutura (estados, etiquetas, módulos). */
  include_work_items?: boolean;
};

export type TEntityTemplateUpdatePayload = Partial<Pick<TEntityTemplate, "name" | "description">> & {
  project_only?: false;
};

export type TEntityTemplateApplyPayload = {
  project_id: string;
  issue_id?: string;
  module_id?: string;
  cycle_id?: string;
  /** Só páginas: nome da página nova. */
  name?: string;
};

export type TEntityTemplateApplyResponse = {
  issue_id?: string;
  module_id?: string;
  cycle_id?: string;
  page_id?: string;
  project_id?: string;
};
