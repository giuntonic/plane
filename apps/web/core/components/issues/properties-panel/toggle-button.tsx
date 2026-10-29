/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { workItemPropertiesPanelStore } from "./store";

/** Pespo: esconde ou mostra a coluna de propriedades do item (página cheia e peek em modal/tela cheia). */
export const WorkItemPropertiesPanelToggle = observer(function WorkItemPropertiesPanelToggle() {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { isHidden, toggle } = workItemPropertiesPanelStore;
  const label = isHidden ? t("work_item_properties_panel.show") : t("work_item_properties_panel.hide");

  return (
    <Tooltip tooltipContent={label} isMobile={isMobile}>
      <IconButton
        variant="secondary"
        size="lg"
        onClick={toggle}
        icon={isHidden ? PanelRightOpen : PanelRightClose}
        aria-label={label}
        aria-pressed={isHidden}
      />
    </Tooltip>
  );
});
