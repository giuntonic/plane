/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// api services
import { APIService } from "@/services/api.service";

export type TProjectMetabaseEmbed = {
  configured: boolean;
  url: string | null;
};

export class ProjectMetabaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchEmbed(workspaceSlug: string, projectId: string): Promise<TProjectMetabaseEmbed> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/metabase-embed/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const projectMetabaseService = new ProjectMetabaseService();

export default projectMetabaseService;
