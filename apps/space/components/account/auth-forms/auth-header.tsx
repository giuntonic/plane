/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { i18nInstance, useTranslation } from "@plane/i18n";
import { EAuthModes } from "@/types/auth";

type TAuthHeader = {
  authMode: EAuthModes;
};

type TAuthHeaderContent = {
  header: string;
  subHeader: string;
};

type TAuthHeaderDetails = {
  [mode in EAuthModes]: TAuthHeaderContent;
};

const Titles: TAuthHeaderDetails = {
  [EAuthModes.SIGN_IN]: {
    get header() {
      return i18nInstance.t("ui.sign_in_to_upvote_or_comment");
    },
    get subHeader() {
      return i18nInstance.t("ui.contribute_in_nudging_the_features_you_want");
    },
  },
  [EAuthModes.SIGN_UP]: {
    header: "View, comment, and do more",
    subHeader: "Sign up or log in to work with Plane work items and Pages.",
  },
};

export function AuthHeader(props: TAuthHeader) {
  const { t } = useTranslation();
  const { authMode } = props;

  const getHeaderSubHeader = (mode: EAuthModes | null): TAuthHeaderContent => {
    if (mode) {
      return Titles[mode];
    }

    return {
      header: t("ui.comment_or_react_to_work_items"),
      subHeader: t("ui.use_plane_to_add_your_valuable_inputs"),
    };
  };

  const { header, subHeader } = getHeaderSubHeader(authMode);

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-20 leading-7 font-semibold text-primary">{header}</span>
        <span className="text-20 leading-7 font-semibold text-placeholder">{subHeader}</span>
      </div>
    </>
  );
}
