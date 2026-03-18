import { useEffect, useRef } from "react";
import { useInsightsDashboardStore } from "../stores/dashboardStore";
import { DashboardContext } from "../stores/DashboardContext";
import { saveDashboardWidgets } from "../lib/database";
import { WIDGET_DEFAULTS } from "../lib/dashboardDefaults";
import type { DashboardWidget, WidgetConfig, WidgetType } from "../types";
import DashboardEmptyState from "./DashboardEmptyState";
import DashboardGrid from "./DashboardGrid";
import WidgetFullscreen from "./widgets/WidgetFullscreen";
import WidgetConfigModal from "./config/WidgetConfigModal";

/** Build a widget at position (x, y) with auto-sized defaults. */
function makeWidget(type: WidgetType, config: WidgetConfig, x: number, y: number, wOverride?: number, hOverride?: number): DashboardWidget {
  const defaults = WIDGET_DEFAULTS[type];
  return {
    id: crypto.randomUUID(),
    widget_type: type,
    config,
    layout: {
      x,
      y,
      w: wOverride ?? defaults.defaultW,
      h: hOverride ?? defaults.defaultH,
      minW: defaults.minW,
      minH: defaults.minH,
    },
  };
}

function buildDefaultInsightsWidgets(): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  let y = 0;

  // Section: Overview
  widgets.push(makeWidget("section", { type: "section", title: "Overview" }, 0, y));
  y += 1;

  // 5 metric totals: workouts, hours, calories, output, distance
  const metrics = [
    { metric: "total_workouts", label: "Total Workouts" },
    { metric: "total_hours", label: "Total Hours" },
    { metric: "total_calories", label: "Total Calories" },
    { metric: "total_output_kj", label: "Total Output (kj)" },
    { metric: "total_distance", label: "Total Distance" },
  ];
  // Layout: 3 + 3 + ... across 12 cols, but we have 5 so do row of 3 then row of 2
  // Actually 5 metrics fit in ~2.4 each, let's do 2 cols wide each = 10 cols, or mix
  // Use 2-col each, 5 across won't fit in 12. Do first row: 3 widgets x 4 cols
  for (let i = 0; i < 3; i++) {
    widgets.push(makeWidget("metric_total", {
      type: "metric_total",
      metric: metrics[i].metric,
      label: metrics[i].label,
      filters: [],
    }, i * 4, y, 4, 2));
  }
  y += 2;
  for (let i = 3; i < 5; i++) {
    widgets.push(makeWidget("metric_total", {
      type: "metric_total",
      metric: metrics[i].metric,
      label: metrics[i].label,
      filters: [],
    }, (i - 3) * 4, y, 4, 2));
  }
  y += 2;

  // Activity grid
  widgets.push(makeWidget("activity_grid", {
    type: "activity_grid",
    title: "Workout Activity",
    metric: "workout_count",
    color: "#216e39",
    filters: [],
  }, 0, y, 12, 3));
  y += 3;

  // Section: Personal Records
  widgets.push(makeWidget("section", { type: "section", title: "Personal Records" }, 0, y));
  y += 1;

  // 3 personal record widgets
  const records = [
    { metric: "total_work", title: "Highest Output" },
    { metric: "calories", title: "Most Calories" },
    { metric: "strive_score", title: "Best Strive Score" },
  ];
  for (let i = 0; i < records.length; i++) {
    widgets.push(makeWidget("personal_record", {
      type: "personal_record",
      metric: records[i].metric,
      title: records[i].title,
      filters: [],
    }, i * 4, y, 4, 3));
  }
  y += 3;

  // Section: Favorites
  widgets.push(makeWidget("section", { type: "section", title: "Favorites" }, 0, y));
  y += 1;

  // 2 chart widgets: top instructors bar + top class types bar
  widgets.push(makeWidget("chart", {
    type: "chart",
    chart: {
      name: "Top Instructors",
      mark_type: "bar",
      y_fields: [{ field: "avg_output", side: "left" }],
      group_by: null,
      filters: [],
      x_axis_mode: "category",
      x_axis_field: "instructor",
      x_axis_sequential: false,
      agg_function: "count",
    },
  }, 0, y, 6, 6));

  widgets.push(makeWidget("chart", {
    type: "chart",
    chart: {
      name: "Top Class Types",
      mark_type: "bar",
      y_fields: [{ field: "avg_output", side: "left" }],
      group_by: null,
      filters: [],
      x_axis_mode: "category",
      x_axis_field: "class_type",
      x_axis_sequential: false,
      agg_function: "count",
    },
  }, 6, y, 6, 6));
  y += 6;

  // Section: Most Repeated
  widgets.push(makeWidget("section", { type: "section", title: "Most Repeated" }, 0, y));
  y += 1;

  widgets.push(makeWidget("most_repeated", {
    type: "most_repeated",
    title: "Most Repeated Rides",
    limit: 10,
    filters: [],
  }, 0, y, 6, 5));

  return widgets;
}

export default function InsightsNewTab() {
  const dashboard = useInsightsDashboardStore((s) => s.dashboard);
  const expandedWidgetId = useInsightsDashboardStore((s) => s.expandedWidgetId);
  const mode = useInsightsDashboardStore((s) => s.mode);
  const configuringWidgetId = useInsightsDashboardStore((s) => s.configuringWidgetId);
  const addingWidgetType = useInsightsDashboardStore((s) => s.addingWidgetType);
  const loadDashboard = useInsightsDashboardStore((s) => s.loadDashboard);
  const populated = useRef(false);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-populate on first load when dashboard is empty
  useEffect(() => {
    if (!dashboard || populated.current) return;
    if (dashboard.widgets.length > 0) {
      populated.current = true;
      return;
    }
    populated.current = true;

    const defaultWidgets = buildDefaultInsightsWidgets();
    const updatedDashboard = { ...dashboard, widgets: defaultWidgets };
    useInsightsDashboardStore.setState({ dashboard: updatedDashboard });
    saveDashboardWidgets(dashboard.id, defaultWidgets).catch((err) =>
      console.error("Failed to save insights dashboard:", err),
    );
  }, [dashboard]);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-gray-400">Loading dashboard...</span>
      </div>
    );
  }

  if (expandedWidgetId) {
    const widget = dashboard.widgets.find((w) => w.id === expandedWidgetId);
    if (widget) return (
      <DashboardContext.Provider value={useInsightsDashboardStore}>
        <WidgetFullscreen widget={widget} />
      </DashboardContext.Provider>
    );
  }

  if (dashboard.widgets.length === 0 && mode === "view") {
    return (
      <DashboardContext.Provider value={useInsightsDashboardStore}>
        <DashboardEmptyState />
      </DashboardContext.Provider>
    );
  }

  return (
    <DashboardContext.Provider value={useInsightsDashboardStore}>
      {dashboard.widgets.length === 0 ? <DashboardEmptyState /> : <DashboardGrid dashboard={dashboard} />}
      {(configuringWidgetId || addingWidgetType) && <WidgetConfigModal />}
    </DashboardContext.Provider>
  );
}
