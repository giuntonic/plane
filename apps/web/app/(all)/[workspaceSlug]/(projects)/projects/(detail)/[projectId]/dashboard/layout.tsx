/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectPiecesPanelHeader } from "@/components/projects/pieces-panel/header";

// Pespo: painel de peças do projeto (a rota /dashboard era do embed do Metabase).
export default function ProjectPiecesPanelLayout() {
  return (
    <>
      <AppHeader header={<ProjectPiecesPanelHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
