import type { DashboardWidget } from "../../types";
import { useDashboardStore } from "../../stores/dashboardStore";
import ChartWidget from "./ChartWidget";
import MetricTotalWidget from "./MetricTotalWidget";
import LastWorkoutWidget from "./LastWorkoutWidget";
import SectionWidget from "./SectionWidget";
import ActivityGridWidget from "./ActivityGridWidget";

interface Props {
  widget: DashboardWidget;
}

export default function WidgetWrapper({ widget }: Props) {
  const mode = useDashboardStore((s) => s.mode);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const expandWidget = useDashboardStore((s) => s.expandWidget);
  const startConfiguring = useDashboardStore((s) => s.startConfiguring);

  const isSection = widget.config.type === "section";

  return (
    <div className={`group relative h-full select-none ${isSection ? "" : "rounded-lg border border-gray-200 bg-white shadow-sm"}`}>
      {/* Drag handle — full top edge, only in edit mode */}
      {mode === "edit" && (
        <div className="widget-drag-handle absolute inset-x-0 top-0 z-10 flex h-6 cursor-grab items-center justify-center rounded-t-lg">
          <svg className="h-4 w-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="6" r="1.2" />
            <circle cx="8" cy="6" r="1.2" />
            <circle cx="11" cy="6" r="1.2" />
            <circle cx="5" cy="10" r="1.2" />
            <circle cx="8" cy="10" r="1.2" />
            <circle cx="11" cy="10" r="1.2" />
          </svg>
        </div>
      )}

      {/* Overlay action buttons — always visible in edit, hover-only in view */}
      <div className={`absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded bg-white/80 shadow-sm backdrop-blur transition-opacity ${
        mode === "edit" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}>
        {mode === "view" && !isSection && (
          <button
            onClick={() => expandWidget(widget.id)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Fullscreen"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
            </svg>
          </button>
        )}
        {mode === "edit" && (
          <>
            <button
              onClick={() => startConfiguring(widget.id)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Configure"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6.5 1.5h3l.5 2 1.5.9 2-.5 1.5 2.6-1.5 1.5v1.8l1.5 1.5-1.5 2.6-2-.5-1.5.9-.5 2h-3l-.5-2-1.5-.9-2 .5-1.5-2.6 1.5-1.5V7.5L1 6l1.5-2.6 2 .5 1.5-.9z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (window.confirm("Remove this widget?")) removeWidget(widget.id);
              }}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              title="Remove"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Widget content — fills entire card */}
      <div className="h-full overflow-hidden rounded-lg p-3">
        {widget.config.type === "chart" && <ChartWidget widget={widget} />}
        {widget.config.type === "metric_total" && <MetricTotalWidget widget={widget} />}
        {widget.config.type === "last_workout" && <LastWorkoutWidget widget={widget} />}
        {widget.config.type === "section" && <SectionWidget widget={widget} />}
        {widget.config.type === "activity_grid" && <ActivityGridWidget widget={widget} />}
      </div>
    </div>
  );
}
