/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type {
  DragLocationHistory,
  DropTargetRecord,
  ElementDragPayload,
} from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { THomeWidgetKeys, THomeWidgetProps } from "@plane/types";
// assets
import darkWidgetsAsset from "@/app/assets/empty-state/dashboard/widgets-dark.webp?url";
import lightWidgetsAsset from "@/app/assets/empty-state/dashboard/widgets-light.webp?url";
// components
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { StickiesWidget } from "../stickies/widget";
import { HomeLoader, NoProjectsEmptyState, RecentActivityWidget } from "./widgets";
import { AddWidgetMenu } from "./widgets/add-widget-menu";
import { DashboardAgenda } from "./widgets/agenda";
import { DashboardWidgetBlock } from "./widgets/dashboard-block";
import { DashboardQuickLinks } from "./widgets/links";
import { ManageWidgetsModal } from "./widgets/manage";
import { getInstructionFromPayload, type TargetData } from "./widgets/manage/widget.helpers";
import { DashboardTaskList } from "./widgets/tasks";

export const HOME_WIDGETS_LIST: {
  [key in THomeWidgetKeys]: {
    component: React.FC<THomeWidgetProps> | null;
    /** Pespo: starting width on the 4-column grid (each person can resize it). */
    defaultWidth: number;
    /** Pespo: not offered to workspace guests (clients). */
    hideForGuests?: boolean;
    title: string;
  };
} = {
  quick_links: {
    component: DashboardQuickLinks,
    defaultWidth: 2,
    title: "home.quick_links.title_plural",
  },
  recents: {
    component: RecentActivityWidget,
    defaultWidth: 2,
    title: "home.recents.title",
  },
  my_stickies: {
    component: StickiesWidget,
    defaultWidth: 2,
    title: "stickies.title",
  },
  task_list: {
    component: DashboardTaskList,
    defaultWidth: 2,
    title: "home.tasks.title",
  },
  google_calendar: {
    component: DashboardAgenda,
    defaultWidth: 2,
    hideForGuests: true,
    title: "home.agenda.title",
  },
  new_at_plane: {
    component: null,
    defaultWidth: 2,
    title: "home.new_at_plane.title",
  },
  quick_tutorial: {
    component: null,
    defaultWidth: 2,
    title: "home.quick_tutorial.title",
  },
};

/** Pespo: widgets this person can have on the home (with a component, and not guest-only hidden). */
export const useAvailableHomeWidgetKeys = () => {
  const { orderedWidgets } = useHome();
  const { allowPermissions } = useUserPermissions();
  const isGuest = !allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  return orderedWidgets.filter((key) => {
    const widget = HOME_WIDGETS_LIST[key];
    return !!widget?.component && !(isGuest && widget.hideForGuests);
  });
};

export const DashboardWidgets = observer(function DashboardWidgets() {
  // router
  const { workspaceSlug } = useParams();
  // navigation
  const pathname = usePathname();
  // theme hook
  const { resolvedTheme } = useTheme();
  // store hooks
  const { toggleWidgetSettings, widgetsMap, showWidgetSettings, loading, reorderWidget } = useHome();
  const { loader } = useProject();
  // plane hooks
  const { t } = useTranslation();
  // derived values
  const noWidgetsResolvedPath = resolvedTheme === "light" ? lightWidgetsAsset : darkWidgetsAsset;
  const availableWidgets = useAvailableHomeWidgetKeys();
  const enabledWidgets = availableWidgets.filter((key) => widgetsMap[key]?.is_enabled);

  const handleDrop = (self: DropTargetRecord, source: ElementDragPayload, location: DragLocationHistory) => {
    const dropTargets = location?.current?.dropTargets ?? [];
    if (!dropTargets || dropTargets.length <= 0) return;
    const dropTarget =
      dropTargets.length > 1 ? dropTargets.find((target: DropTargetRecord) => target?.data?.isChild) : dropTargets[0];

    const dropTargetData = dropTarget?.data as TargetData;
    if (!dropTarget || !dropTargetData) return;

    const instruction = getInstructionFromPayload(dropTarget, source, location);
    const droppedId = dropTargetData.id;
    const sourceData = source.data as TargetData;

    if (!sourceData.id || !droppedId || !workspaceSlug) return;
    reorderWidget(workspaceSlug.toString(), sourceData.id, droppedId, instruction).catch(() => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("home.widget.reordering_failed"),
      });
    });
  };

  // derived values
  const isWikiApp = pathname.includes(`/${workspaceSlug.toString()}/pages`);
  if (!workspaceSlug) return null;
  if (loading || loader !== "loaded") return <HomeLoader />;

  return (
    <div className="relative flex h-full w-full flex-col gap-7">
      <ManageWidgetsModal
        workspaceSlug={workspaceSlug.toString()}
        isModalOpen={showWidgetSettings}
        handleOnClose={() => toggleWidgetSettings(false)}
      />
      {!isWikiApp && <NoProjectsEmptyState />}

      {enabledWidgets.length > 0 ? (
        <div data-home-grid className="grid grid-cols-1 gap-4 md:grid-flow-row-dense md:grid-cols-4">
          {enabledWidgets.map((key, index) => {
            const WidgetComponent = HOME_WIDGETS_LIST[key]?.component;
            if (!WidgetComponent) return null;
            return (
              <DashboardWidgetBlock
                key={key}
                workspaceSlug={workspaceSlug.toString()}
                widgetKey={key}
                title={t(HOME_WIDGETS_LIST[key].title)}
                defaultWidth={HOME_WIDGETS_LIST[key].defaultWidth}
                isLastChild={index === enabledWidgets.length - 1}
                handleDrop={handleDrop}
              >
                <WidgetComponent workspaceSlug={workspaceSlug.toString()} />
              </DashboardWidgetBlock>
            );
          })}
          <AddWidgetMenu workspaceSlug={workspaceSlug.toString()} availableWidgets={availableWidgets} />
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center gap-4">
          <SimpleEmptyState
            title={t("home.empty.widgets.title")}
            description={t("home.empty.widgets.description")}
            assetPath={noWidgetsResolvedPath}
          />
          <div className="w-full max-w-xs">
            <AddWidgetMenu workspaceSlug={workspaceSlug.toString()} availableWidgets={availableWidgets} />
          </div>
        </div>
      )}
    </div>
  );
});
