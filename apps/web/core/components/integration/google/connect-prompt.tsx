/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { GoogleMark } from "./google-mark";
import { useGoogleConnect } from "./use-google-account";

type Props = {
  /** Por que conectar, no lugar em que a pessoa está (ex.: "para ver as reuniões aqui"). */
  description?: string;
  className?: string;
  size?: "sm" | "md";
  onConnected?: () => void;
};

/** Pespo: convite para conectar a conta Google ali mesmo, sem ir para as configurações. */
export function GoogleConnectPrompt(props: Props) {
  const { description, className, size = "md", onConnected } = props;
  const { t } = useTranslation();
  const { connect, isConnecting } = useGoogleConnect(onConnected);

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-subtle bg-layer-1",
        size === "sm" ? "p-3" : "p-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <GoogleMark className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-body-sm-medium text-primary">{t("google_account.prompt_title")}</span>
          <span className="text-body-xs-regular text-tertiary">
            {description ?? t("google_account.prompt_description")}
          </span>
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={connect} loading={isConnecting} disabled={isConnecting}>
        {isConnecting ? t("google_account.connecting") : t("google_account.connect")}
      </Button>
    </div>
  );
}
