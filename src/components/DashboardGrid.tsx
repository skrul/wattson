import { useState } from "react";
import { GridLayout, verticalCompactor, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import type { Dashboard } from "../types";
import { useDashboardContext } from "../stores/DashboardContext";
import { useDashboardRegistryStore } from "../stores/dashboardRegistryStore";
import { WIDGET_DEFAULTS } from "../lib/dashboardDefaults";
import WidgetWrapper from "./widgets/WidgetWrapper";
import AddWidgetMenu from "./config/AddWidgetMenu";
import ManageDashboardsModal from "./config/ManageDashboardsModal";

interface Props {
  dashboard: Dashboard;
}

export default function DashboardGrid({ dashboard }: Props) {
  const useStore = useDashboardContext();
  const mode = useStore((s) => s.mode);
  const displayName = useDashboardRegistryStore(
    (s) => s.dashboards.find((d) => d.id === dashboard.id)?.name ?? dashboard.name,
  );
  const enterEditMode = useStore((s) => s.enterEditMode);
  const exitEditMode = useStore((s) => s.exitEditMode);
  const updateLayouts = useStore((s) => s.updateLayouts);
  const [manageOpen, setManageOpen] = useState(false);

  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 });

  const layout: LayoutItem[] = dashboard.widgets.map((w) => {
    const defaults = WIDGET_DEFAULTS[w.widget_type];
    return {
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: w.layout.minW ?? defaults.minW,
      minH: w.layout.minH ?? defaults.minH,
      static: mode === "view",
    };
  });

  const handleLayoutChange = (newLayout: Layout) => {
    if (mode !== "edit") return;
    updateLayouts(
      newLayout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
    );
  };

  const cols = 24;
  const rowHeight = 40;

  return (
    <div ref={containerRef}>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{displayName}</h2>
        <div className="flex items-center gap-2">
          {mode === "edit" ? (
            <>
              <AddWidgetMenu />
              <button
                onClick={() => setManageOpen(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Manage Dashboards
              </button>
              <button
                onClick={exitEditMode}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Done
              </button>
            </>
          ) : (
            <button
              onClick={enterEditMode}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{ position: "relative" }}>
        {mode === "edit" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
              zIndex: 1,
              backgroundImage: `
                linear-gradient(to right, rgba(59,130,246,0.2) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(59,130,246,0.2) 1px, transparent 1px)
              `,
              backgroundSize: `${width / cols}px ${rowHeight}px`,
            }}
          />
        )}
        <GridLayout
          className="layout"
          layout={layout}
          width={width}
          gridConfig={{ cols, rowHeight, margin: [0, 0], containerPadding: [0, 0] }}
          dragConfig={{ enabled: mode === "edit", handle: ".widget-drag-handle" }}
          resizeConfig={{ enabled: mode === "edit" }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id} className="h-full p-1">
              <WidgetWrapper widget={widget} />
            </div>
          ))}
        </GridLayout>
      </div>
      <ManageDashboardsModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
