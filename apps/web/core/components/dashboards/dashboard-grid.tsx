/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { debounce } from "lodash-es";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import type { Layout } from "react-grid-layout/legacy";
// oxlint-disable-next-line import/no-unassigned-import
import "react-grid-layout/css/styles.css";
// plane package imports
import { Button } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { CustomMenu } from "@plane/ui";
import type { TDashboard, TDashboardWidget } from "@plane/types";
// hooks
import { useDashboards } from "@/hooks/store/use-dashboards";
// plane web components
import { ChartWidget } from "./widget/chart-widget";
import { WidgetConfigFormModal } from "./widget/widget-config-form-modal";

const GridLayoutWithWidth = WidthProvider(GridLayout);

type Props = {
  dashboard: TDashboard;
  workspaceSlug: string;
  projectId?: string;
};

export const DashboardGrid = observer(function DashboardGrid(props: Props) {
  const { dashboard, workspaceSlug, projectId } = props;
  const { updateWidget, deleteWidget } = useDashboards();

  const [isWidgetFormOpen, setIsWidgetFormOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<TDashboardWidget | null>(null);

  const widgets = useMemo(() => dashboard.widgets ?? [], [dashboard.widgets]);

  const layout: Layout = useMemo(
    () =>
      widgets.map((widget, index) => ({
        i: widget.id,
        x: widget.layout?.x ?? (index * 4) % 12,
        y: widget.layout?.y ?? Math.floor((index * 4) / 12) * 4,
        w: widget.layout?.w ?? 4,
        h: widget.layout?.h ?? 4,
        minW: 3,
        minH: 3,
      })),
    [widgets]
  );

  const persistLayout = useMemo(
    () =>
      debounce((nextLayout: Layout) => {
        nextLayout.forEach((item) => {
          const widget = widgets.find((w) => w.id === item.i);
          if (!widget) return;
          const current = widget.layout ?? {};
          if (current.x === item.x && current.y === item.y && current.w === item.w && current.h === item.h) return;
          updateWidget(
            workspaceSlug,
            dashboard.id,
            widget.id,
            { layout: { x: item.x, y: item.y, w: item.w, h: item.h } },
            projectId
          ).catch(() => undefined);
        });
      }, 600),
    [dashboard.id, projectId, updateWidget, widgets, workspaceSlug]
  );

  const handleLayoutChange = useCallback((nextLayout: Layout) => persistLayout(nextLayout), [persistLayout]);

  const handleDeleteWidget = useCallback(
    async (widgetId: string) => {
      try {
        await deleteWidget(workspaceSlug, dashboard.id, widgetId, projectId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Widget deleted successfully." });
      } catch {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to delete widget." });
      }
    },
    [dashboard.id, deleteWidget, projectId, workspaceSlug]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end px-6 py-3">
        <Button
          variant="secondary"
          size="sm"
          prependIcon={<Plus className="size-3.5" />}
          onClick={() => {
            setEditingWidget(null);
            setIsWidgetFormOpen(true);
          }}
        >
          Add widget
        </Button>
      </div>

      {widgets.length === 0 ? (
        <EmptyStateCompact
          assetKey="unknown"
          assetClassName="size-20"
          rootClassName="flex-1 border border-dashed border-subtle mx-6 mb-6 rounded-md"
          title="No widgets yet. Add your first chart to this dashboard."
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <GridLayoutWithWidth
            className="layout"
            layout={layout}
            cols={12}
            rowHeight={60}
            margin={[16, 16]}
            draggableHandle=".dashboard-widget-drag-handle"
            onLayoutChange={handleLayoutChange}
          >
            {widgets.map((widget) => (
              <div key={widget.id} className="bg-primary flex flex-col overflow-hidden rounded-md border border-subtle">
                <div className="dashboard-widget-drag-handle flex cursor-move items-center justify-between border-b border-subtle px-3 py-2">
                  <span className="truncate text-13 font-medium text-primary">{widget.name}</span>
                  <CustomMenu
                    customButton={<IconButton icon={MoreHorizontal} variant="ghost" size="sm" />}
                    closeOnSelect
                  >
                    <CustomMenu.MenuItem
                      onClick={() => {
                        setEditingWidget(widget);
                        setIsWidgetFormOpen(true);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </CustomMenu.MenuItem>
                    <CustomMenu.MenuItem
                      onClick={() => handleDeleteWidget(widget.id)}
                      className="text-danger flex items-center gap-2"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </CustomMenu.MenuItem>
                  </CustomMenu>
                </div>
                <div className="min-h-0 flex-1 p-3">
                  <ChartWidget widget={widget} workspaceSlug={workspaceSlug} projectId={projectId} />
                </div>
              </div>
            ))}
          </GridLayoutWithWidth>
        </div>
      )}

      <WidgetConfigFormModal
        isOpen={isWidgetFormOpen}
        handleClose={() => setIsWidgetFormOpen(false)}
        workspaceSlug={workspaceSlug}
        dashboardId={dashboard.id}
        projectId={projectId}
        data={editingWidget}
      />
    </div>
  );
});
