/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Sparkles, Wrench } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// local imports
import { formatReleaseDate, markCurrentReleaseSeen, releaseAnchor } from "./helpers";
import type { TPespoRelease } from "./releases";
import { PESPO_RELEASES } from "./releases";

function ReleaseSection(props: { title: string; items: string[]; icon: React.ReactNode }) {
  const { title, items, icon } = props;
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-body-sm-medium text-secondary">
        {icon}
        {title}
      </h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-9 text-body-sm-regular text-primary marker:text-tertiary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ReleaseCard(props: { release: TPespoRelease; isCurrent: boolean }) {
  const { release, isCurrent } = props;
  const { t, currentLocale } = useTranslation();
  return (
    <article id={releaseAnchor(release.version)} className="relative scroll-mt-6 pl-8">
      {/* linha do tempo */}
      <span
        className={cn("border-surface-1 absolute top-1.5 left-0 size-3 rounded-full border-2", {
          "ring-accent-primary/20 bg-accent-primary ring-4": isCurrent,
          "bg-layer-3": !isCurrent,
        })}
      />
      <div className="flex flex-col gap-4 rounded-lg border border-subtle bg-layer-1 p-5">
        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h5-medium text-primary">{t("release_notes.version", { version: release.version })}</h2>
            {isCurrent && (
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-caption-sm-medium text-accent-primary">
                {t("release_notes.current")}
              </span>
            )}
          </div>
          <time dateTime={release.date} className="text-caption-md-regular text-tertiary">
            {formatReleaseDate(release.date, currentLocale)}
          </time>
          <p className="mt-1 text-body-sm-regular text-secondary">{release.summary}</p>
        </header>
        <ReleaseSection
          title={t("release_notes.features")}
          items={release.features}
          icon={<Sparkles className="size-4 text-accent-primary" />}
        />
        <ReleaseSection
          title={t("release_notes.fixes")}
          items={release.fixes}
          icon={<Wrench className="size-4 text-tertiary" />}
        />
      </div>
    </article>
  );
}

export function ReleaseNotesRoot() {
  const { t } = useTranslation();

  useEffect(() => {
    markCurrentReleaseSeen();
    // O link do botão da versão pode apontar para uma versão específica (#v1.5).
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h3-semibold text-primary">{t("release_notes.title")}</h1>
        <p className="text-body-sm-regular text-tertiary">{t("release_notes.description")}</p>
      </div>
      <div className="relative flex flex-col gap-6 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-layer-3">
        {PESPO_RELEASES.map((release, index) => (
          <ReleaseCard key={release.version} release={release} isCurrent={index === 0} />
        ))}
      </div>
    </div>
  );
}
