import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardWidget } from "../../types";
import { getDailyMetricValues } from "../../lib/database";
import type { DailyMetricValue } from "../../lib/database";
import { renderActivityGrid, ACTIVITY_GRID_LAYOUT } from "../../lib/charts";
import { ACTIVITY_GRID_METRICS } from "../../lib/dashboardDefaults";
import { useNavigationStore } from "../../stores/navigationStore";
import { useWorkoutStore } from "../../stores/workoutStore";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
  preview?: boolean;
}

const DAY_LABELS: { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 3, label: "Wed" },
  { day: 5, label: "Fri" },
];

export default function ActivityGridWidget({ widget, preview }: Props) {
  const [data, setData] = useState<DailyMetricValue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);
  const syncGeneration = useWorkoutStore((s) => s.syncGeneration);

  const handleDayClick = useCallback((date: string) => {
    navigateToFilteredWorkouts({
      workoutId: "",
      conditions: [{ id: `grid-${Date.now()}`, field: "date", operator: "between", value: "", values: [date, date] }],
      sort: { field: "date", direction: "desc" },
    });
  }, [navigateToFilteredWorkouts]);

  if (widget.config.type !== "activity_grid") return null;
  const { title, metric, color, filters } = widget.config;

  const metricDef = ACTIVITY_GRID_METRICS.find((m) => m.key === metric);
  const tooltipLabel = metricDef?.tooltipLabel ?? metric;

  useEffect(() => {
    setLoading(true);
    getDailyMetricValues(preview ? 365 : 0, metric, filters)
      .then((v) => setData(v))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [metric, preview, JSON.stringify(filters), syncGeneration]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data) return;

    function renderSvg() {
      const svg = renderActivityGrid(data!, tooltipLabel, color || "#216e39", handleDayClick, true);
      (svg as HTMLElement).style.minWidth = `${svg.getAttribute("width") ?? 0}px`;
      (svg as HTMLElement).style.display = "block";
      (svg as HTMLElement).style.overflow = "visible";
      const scrollPos = el!.scrollLeft;
      el!.replaceChildren(svg);
      // Restore scroll position on re-render (e.g. returning to tab)
      if (scrollPos > 0) el!.scrollLeft = scrollPos;
    }

    renderSvg();

    // Scroll to the right (most recent) once visible and layout has settled.
    // Re-render the SVG when returning to the tab to clear stale tooltips.
    let scrolled = false;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      el.scrollLeft = el.scrollWidth;
      clearTimeout(timer);
      timer = setTimeout(() => ro.disconnect(), 500);
    });
    let wasHidden = false;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        if (!scrolled) {
          el.scrollLeft = el.scrollWidth;
          ro.observe(el);
          scrolled = true;
        }
        if (wasHidden) {
          renderSvg();
          wasHidden = false;
        }
      } else {
        wasHidden = true;
      }
    });
    io.observe(el);
    return () => { io.disconnect(); ro.disconnect(); clearTimeout(timer); };
  }, [data, tooltipLabel, color, handleDayClick]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">No data</span>
      </div>
    );
  }

  const { cellSize, marginTop } = ACTIVITY_GRID_LAYOUT;

  return (
    <div className="flex h-full flex-col">
      {title && (
        <span className="text-sm font-medium text-gray-700">{title}</span>
      )}
      <div className="relative min-h-0 flex-1 flex">
        {/* Fixed day-of-week labels */}
        <div className="shrink-0 relative" style={{ width: 30 }}>
          {DAY_LABELS.map(({ day, label }) => (
            <span
              key={day}
              className="absolute text-[10px] text-gray-500"
              style={{
                top: marginTop + day * cellSize + cellSize / 2,
                right: 4,
                transform: "translateY(-50%)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
        {/* Scrollable grid */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto" />
      </div>
    </div>
  );
}
