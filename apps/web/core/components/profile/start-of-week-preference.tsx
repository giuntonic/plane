/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { START_OF_THE_WEEK_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EStartOfTheWeek } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUserProfile } from "@/hooks/store/user";

const DAY_KEY_BY_VALUE: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

export const StartOfWeekPreference = observer(function StartOfWeekPreference() {
  // hooks
  const { data: userProfile, updateUserProfile } = useUserProfile();
  const { t } = useTranslation();

  const handleStartOfWeekChange = async (val: number) => {
    try {
      await updateUserProfile({ start_of_the_week: val });
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("common.start_of_week.updated") });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.start_of_week.update_failed"),
        message: t("common.errors.default.message"),
      });
    }
  };

  return (
    <SettingsControlItem
      title={t("common.start_of_week.title")}
      description={t("common.start_of_week.description")}
      control={
        <CustomSelect
          value={userProfile.start_of_the_week}
          label={t(`common.days.${DAY_KEY_BY_VALUE[userProfile.start_of_the_week]}`)}
          onChange={handleStartOfWeekChange}
          buttonClassName="border border-subtle-1"
          input
          maxHeight="lg"
          placement="bottom-end"
        >
          <>
            {START_OF_THE_WEEK_OPTIONS.map((day) => (
              <CustomSelect.Option key={day.value} value={day.value}>
                {t(`common.days.${DAY_KEY_BY_VALUE[day.value]}`)}
              </CustomSelect.Option>
            ))}
          </>
        </CustomSelect>
      }
    />
  );
});
