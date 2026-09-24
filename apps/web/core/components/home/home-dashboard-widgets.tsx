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
import type { THomeWidgetKeys, THomeWidgetProps } from "@plane/types";
// assets
import darkWidgetsAsset from "@/app/assets/empty-state/dashboard/widgets-dark.webp?url";
import lightWidgetsAsset from "@/app/assets/empty-state/dashboard/widgets-light.webp?url";
// components
import { SimpleEmptyState } from "@/components/empty-state/simple-empty-state-root";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { StickiesWidget } from "../stickies/widget";
import { HomeLoader, NoProjectsEmptyState, RecentActivityWidget } from "./widgets";
import { DashboardWidgetBlock } from "./widgets/dashboard-block";
import { DashboardQuickLinks } from "./widgets/links";
import { ManageWidgetsModal } from "./widgets/manage";
import { getInstructionFromPayload, type TargetData } from "./widgets/manage/widget.helpers";
import { DashboardTaskList } from "./widgets/tasks";

export const HOME_WIDGETS_LIST: {
  [key in THomeWidgetKeys]: {
    component: React.FC<THomeWidgetProps> | null;
    fullWidth: boolean;
    title: string;
  };
} = {
  quick_links: {
    component: DashboardQuickLinks,
    fullWidth: false,
    title: "home.quick_links.title_plural",
  },
  recents: {
    component: RecentActivityWidget,
    fullWidth: false,
    title: "home.recents.title",
  },
  my_stickies: {
    component: StickiesWidget,
    fullWidth: false,
    title: "stickies.title",
  },
  task_list: {
    component: DashboardTaskList,
    fullWidth: false,
    title: "home.tasks.title",
  },
  new_at_plane: {
    component: null,
    fullWidth: false,
    title: "home.new_at_plane.title",
  },
  quick_tutorial: {
    component: null,
    fullWidth: false,
    title: "home.quick_tutorial.title",
  },
};

export const DashboardWidgets = observer(function DashboardWidgets() {
  // router
  const { workspaceSlug } = useParams();
  // navigation
  const pathname = usePathname();
  // theme hook
  const { resolvedTheme } = useTheme();
  // store hooks
  const {
    toggleWidgetSettings,
    widgetsMap,
    showWidgetSettings,
    orderedWidgets,
    isAnyWidgetEnabled,
    loading,
    reorderWidget,
  } = useHome();
  const { loader } = useProject();
  // plane hooks
  const { t } = useTranslation();
  // derived values
  const noWidgetsResolvedPath = resolvedTheme === "light" ? lightWidgetsAsset : darkWidgetsAsset;
  const enabledWidgets = orderedWidgets.filter(
    (key) => HOME_WIDGETS_LIST[key]?.component && widgetsMap[key]?.is_enabled
  );

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

      {isAnyWidgetEnabled ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {enabledWidgets.map((key, index) => {
            const WidgetComponent = HOME_WIDGETS_LIST[key]?.component;
            if (!WidgetComponent) return null;
            return (
              <DashboardWidgetBlock
                key={key}
                widgetKey={key}
                fullWidth={HOME_WIDGETS_LIST[key]?.fullWidth ?? false}
                isLastChild={index === enabledWidgets.length - 1}
                handleDrop={handleDrop}
              >
                <WidgetComponent workspaceSlug={workspaceSlug.toString()} />
              </DashboardWidgetBlock>
            );
          })}
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center">
          <SimpleEmptyState
            title={t("home.empty.widgets.title")}
            description={t("home.empty.widgets.description")}
            assetPath={noWidgetsResolvedPath}
          />
        </div>
      )}
    </div>
  );
});
