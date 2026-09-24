/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { i18nInstance } from "@plane/i18n";
import Link from "next/link";
// plane packages
import type { TAdminAuthErrorInfo } from "@plane/constants";
import { SUPPORT_EMAIL, EAdminAuthErrorCodes } from "@plane/constants";

export enum EErrorAlertType {
  BANNER_ALERT = "BANNER_ALERT",
  INLINE_FIRST_NAME = "INLINE_FIRST_NAME",
  INLINE_EMAIL = "INLINE_EMAIL",
  INLINE_PASSWORD = "INLINE_PASSWORD",
  INLINE_EMAIL_CODE = "INLINE_EMAIL_CODE",
}

const errorCodeMessages: {
  [key in EAdminAuthErrorCodes]: { title: string; message: (email?: string) => React.ReactNode };
} = {
  // admin
  [EAdminAuthErrorCodes.ADMIN_ALREADY_EXIST]: {
    get title() {
      return i18nInstance.t("auth_errors.admin_already_exists");
    },
    message: () => i18nInstance.t("auth_errors.admin_already_exists_please_try_again"),
  },
  [EAdminAuthErrorCodes.REQUIRED_ADMIN_EMAIL_PASSWORD_FIRST_NAME]: {
    get title() {
      return i18nInstance.t("auth_errors.email_password_and_first_name_required");
    },
    message: () => i18nInstance.t("auth_errors.email_password_and_first_name_required_please_try"),
  },
  [EAdminAuthErrorCodes.INVALID_ADMIN_EMAIL]: {
    get title() {
      return i18nInstance.t("auth_errors.invalid_admin_email");
    },
    message: () => i18nInstance.t("auth_errors.invalid_admin_email_please_try_again"),
  },
  [EAdminAuthErrorCodes.INVALID_ADMIN_PASSWORD]: {
    get title() {
      return i18nInstance.t("auth_errors.invalid_admin_password");
    },
    message: () => i18nInstance.t("auth_errors.invalid_admin_password_please_try_again"),
  },
  [EAdminAuthErrorCodes.REQUIRED_ADMIN_EMAIL_PASSWORD]: {
    get title() {
      return i18nInstance.t("auth_errors.email_and_password_required");
    },
    message: () => i18nInstance.t("auth_errors.email_and_password_required_please_try_again"),
  },
  [EAdminAuthErrorCodes.ADMIN_AUTHENTICATION_FAILED]: {
    get title() {
      return i18nInstance.t("auth_errors.authentication_failed");
    },
    message: () => i18nInstance.t("auth_errors.authentication_failed_please_try_again"),
  },
  [EAdminAuthErrorCodes.ADMIN_USER_ALREADY_EXIST]: {
    get title() {
      return i18nInstance.t("auth_errors.admin_user_already_exists");
    },
    message: () => (
      <div>
        {i18nInstance.t("auth_errors.admin_user_already_exists_2")}&nbsp;
        <Link className="font-medium underline underline-offset-4 transition-all hover:font-bold" href={`/admin`}>
          {i18nInstance.t("ui.sign_in")}
        </Link>
        &nbsp;{i18nInstance.t("auth_errors.now")}
      </div>
    ),
  },
  [EAdminAuthErrorCodes.ADMIN_USER_DOES_NOT_EXIST]: {
    get title() {
      return i18nInstance.t("auth_errors.admin_user_does_not_exist");
    },
    message: () => (
      <div>
        {i18nInstance.t("auth_errors.admin_user_does_not_exist_2")}&nbsp;
        <Link className="font-medium underline underline-offset-4 transition-all hover:font-bold" href={`/admin`}>
          {i18nInstance.t("ui.sign_in")}
        </Link>
        &nbsp;{i18nInstance.t("auth_errors.now")}
      </div>
    ),
  },
  [EAdminAuthErrorCodes.ADMIN_USER_DEACTIVATED]: {
    get title() {
      return i18nInstance.t("auth_errors.user_account_deactivated");
    },
    message: () =>
      i18nInstance.t("auth_errors.user_account_deactivated_please_contact_contact", {
        contact: SUPPORT_EMAIL ? SUPPORT_EMAIL : i18nInstance.t("auth_errors.administrator"),
      }),
  },
};

export const authErrorHandler = (errorCode: EAdminAuthErrorCodes, email?: string): TAdminAuthErrorInfo | undefined => {
  const bannerAlertErrorCodes = [
    EAdminAuthErrorCodes.ADMIN_ALREADY_EXIST,
    EAdminAuthErrorCodes.REQUIRED_ADMIN_EMAIL_PASSWORD_FIRST_NAME,
    EAdminAuthErrorCodes.INVALID_ADMIN_EMAIL,
    EAdminAuthErrorCodes.INVALID_ADMIN_PASSWORD,
    EAdminAuthErrorCodes.REQUIRED_ADMIN_EMAIL_PASSWORD,
    EAdminAuthErrorCodes.ADMIN_AUTHENTICATION_FAILED,
    EAdminAuthErrorCodes.ADMIN_USER_ALREADY_EXIST,
    EAdminAuthErrorCodes.ADMIN_USER_DOES_NOT_EXIST,
    EAdminAuthErrorCodes.ADMIN_USER_DEACTIVATED,
  ];

  if (bannerAlertErrorCodes.includes(errorCode))
    return {
      type: EErrorAlertType.BANNER_ALERT,
      code: errorCode,
      title: errorCodeMessages[errorCode]?.title || i18nInstance.t("auth_errors.error"),
      message:
        errorCodeMessages[errorCode]?.message(email) ||
        i18nInstance.t("auth_errors.something_went_wrong_please_try_again"),
    };

  return undefined;
};
