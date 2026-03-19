import { useRef } from "react";
import type { DashboardWidget } from "../../types";
import { useDashboardContext } from "../../stores/DashboardContext";
import { WidgetToolbarContext } from "./WidgetToolbarContext";
import ChartWidget from "./ChartWidget";
import MetricTotalWidget from "./MetricTotalWidget";
import LastWorkoutWidget from "./LastWorkoutWidget";
import SectionWidget from "./SectionWidget";
import ActivityGridWidget from "./ActivityGridWidget";
import PersonalRecordWidget from "./PersonalRecordWidget";
import MostRepeatedWidget from "./MostRepeatedWidget";
import WorkoutListWidget from "./WorkoutListWidget";

interface Props {
  widget: DashboardWidget;
}

export default function WidgetWrapper({ widget }: Props) {
  const useStore = useDashboardContext();
  const mode = useStore((s) => s.mode);
  const removeWidget = useStore((s) => s.removeWidget);
  const expandWidget = useStore((s) => s.expandWidget);
  const startConfiguring = useStore((s) => s.startConfiguring);

  const toolbarSlotRef = useRef<HTMLDivElement | null>(null);
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
        <div ref={toolbarSlotRef} className="flex items-center" />
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
              onMouseDown={(e) => e.stopPropagation()}
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
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async () => { if (await window.confirm("Remove this widget?")) removeWidget(widget.id); }}
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
      <WidgetToolbarContext.Provider value={toolbarSlotRef}>
        <div className={`h-full rounded-lg ${isSection ? "" : widget.config.type === "personal_record" ? "px-1 pt-1" : widget.config.type === "activity_grid" ? "px-3 pt-3 pb-1" : "p-3"}`}>
          {widget.config.type === "chart" && <ChartWidget widget={widget} />}
          {widget.config.type === "metric_total" && <MetricTotalWidget widget={widget} />}
          {widget.config.type === "last_workout" && <LastWorkoutWidget widget={widget} />}
          {widget.config.type === "section" && <SectionWidget widget={widget} />}
          {widget.config.type === "activity_grid" && <ActivityGridWidget widget={widget} />}
          {widget.config.type === "personal_record" && <PersonalRecordWidget widget={widget} />}
          {widget.config.type === "most_repeated" && <MostRepeatedWidget widget={widget} />}
          {widget.config.type === "workout_list" && <WorkoutListWidget widget={widget} />}
        </div>
      </WidgetToolbarContext.Provider>
    </div>
  );
}
