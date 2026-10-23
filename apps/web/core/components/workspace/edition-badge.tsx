/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
// components
import {
  PESPO_RELEASES,
  formatReleaseDate,
  hasSeenCurrentRelease,
  markCurrentReleaseSeen,
} from "@/components/release-notes";

// Pespo: no lugar do selo "Community", o número da versão do Pespo Hub. Clicar abre as novidades;
// passar o mouse mostra a versão atual e o link para as notas de todas as versões.
export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  const { workspaceSlug } = useParams();
  const { t, currentLocale } = useTranslation();
  const [seen, setSeen] = useState(hasSeenCurrentRelease);
  const current = PESPO_RELEASES[0];
  const href = `/${workspaceSlug?.toString()}/whats-new`;
  const handleOpen = () => {
    markCurrentReleaseSeen();
    setSeen(true);
  };

  return (
    <Popover delay={150} openOnHover>
      <Popover.Button
        render={
          <Link
            href={href}
            onClick={handleOpen}
            aria-label={t("release_notes.badge_aria", { version: current.version })}
            className="relative flex h-8 items-center rounded-md px-2.5 text-body-xs-medium text-secondary hover:bg-layer-1-hover hover:text-primary"
          >
            {t("release_notes.version", { version: current.version })}
            {!seen && <span className="absolute top-1 right-0.5 size-1.5 rounded-full bg-accent-primary" aria-hidden />}
          </Link>
        }
      />
      <Popover.Panel
        side="top"
        align="start"
        sideOffset={6}
        className="z-30 w-72 rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200"
      >
        <div className="flex flex-col gap-1">
          <span className="text-body-sm-medium text-primary">
            Pespo Hub {t("release_notes.version", { version: current.version })}
          </span>
          <span className="text-caption-sm-regular text-tertiary">
            {formatReleaseDate(current.date, currentLocale)}
          </span>
          <p className="mt-1 text-caption-md-regular text-secondary">{current.summary}</p>
          <Link
            href={href}
            onClick={handleOpen}
            className="mt-2 flex items-center gap-1 text-caption-md-medium text-accent-primary hover:underline"
          >
            {t("release_notes.see_all")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </Popover.Panel>
    </Popover>
  );
});
