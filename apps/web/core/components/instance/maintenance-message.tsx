/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
export function MaintenanceMessage() {
  const { t } = useTranslation();
  const linkMap = [
    {
      key: "mail_to",
      label: t("ui.contact_support"),
      value: "mailto:support@plane.so",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-left text-18 font-semibold text-primary">
          {t("ui.jsx_looks_like_plane_didnt_start_up_correctly")}
        </h1>
        <span className="text-left text-14 font-medium text-secondary">
          {t("ui.jsx_some_services_might_have_failed_to_start")}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-start gap-6">
        {linkMap.map((link) => (
          <div key={link.key}>
            <a
              href={link.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-13 text-accent-primary hover:underline"
            >
              {link.label}
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
