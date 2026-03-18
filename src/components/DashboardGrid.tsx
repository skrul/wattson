import { GridLayout, verticalCompactor, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import type { Dashboard } from "../types";
import { useDashboardContext } from "../stores/DashboardContext";
import { WIDGET_DEFAULTS } from "../lib/dashboardDefaults";
import WidgetWrapper from "./widgets/WidgetWrapper";
import AddWidgetMenu from "./config/AddWidgetMenu";

interface Props {
  dashboard: Dashboard;
}

export default function DashboardGrid({ dashboard }: Props) {
  const useStore = useDashboardContext();
  const mode = useStore((s) => s.mode);
  const enterEditMode = useStore((s) => s.enterEditMode);
  const exitEditMode = useStore((s) => s.exitEditMode);
  const updateLayouts = useStore((s) => s.updateLayouts);

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
        <h2 className="text-lg font-semibold text-gray-900">{dashboard.name}</h2>
        <div className="flex items-center gap-2">
          {mode === "edit" ? (
            <>
              <AddWidgetMenu />
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
              zIndex: 9999,
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
          gridConfig={{ cols, rowHeight }}
          dragConfig={{ enabled: mode === "edit", handle: ".widget-drag-handle" }}
          resizeConfig={{ enabled: mode === "edit" }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id} className="h-full">
              <WidgetWrapper widget={widget} />
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
