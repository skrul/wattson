import type { DashboardWidget, WidgetConfig, WidgetType } from "../types";

export interface WidgetDefaults {
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export const WIDGET_DEFAULTS: Record<WidgetType, WidgetDefaults> = {
  chart: { defaultW: 12, defaultH: 8, minW: 6, minH: 6 },
  metric_total: { defaultW: 4, defaultH: 3, minW: 3, minH: 3 },
  last_workout: { defaultW: 12, defaultH: 10, minW: 8, minH: 8 },
  section: { defaultW: 24, defaultH: 2, minW: 8, minH: 2 },
  activity_grid: { defaultW: 24, defaultH: 5, minW: 4, minH: 4 },
  personal_record: { defaultW: 8, defaultH: 4, minW: 4, minH: 3 },
  most_repeated: { defaultW: 8, defaultH: 8, minW: 6, minH: 6 },
  workout_list: { defaultW: 8, defaultH: 8, minW: 6, minH: 6 },
};

export interface MetricDefinition {
  key: string;
  label: string;
  format: (value: number) => string;
}

export interface ActivityGridMetric {
  key: string;
  label: string;
  tooltipLabel: string;
}

export const ACTIVITY_GRID_METRICS: ActivityGridMetric[] = [
  { key: "workout_count", label: "Workout Count", tooltipLabel: "workouts" },
  { key: "total_output", label: "Total Output (kj)", tooltipLabel: "kj" },
  { key: "total_calories", label: "Calories", tooltipLabel: "cal" },
  { key: "total_distance", label: "Distance", tooltipLabel: "mi" },
  { key: "total_duration", label: "Duration (min)", tooltipLabel: "min" },
];

export const PREDEFINED_METRICS: MetricDefinition[] = [
  { key: "total_workouts", label: "Total Workouts", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_calories", label: "Total Calories", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_distance", label: "Total Distance", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_output_kj", label: "Total Output (kj)", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_hours", label: "Total Hours", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_output", label: "Avg Output", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_heart_rate", label: "Avg Heart Rate", format: (v) => Math.round(v).toLocaleString() },
];

export interface PersonalRecordMetric {
  key: string;
  label: string;
  unit: string;
  format: (value: number) => string;
}

export const PERSONAL_RECORD_METRICS: PersonalRecordMetric[] = [
  { key: "total_work", label: "Total Output", unit: "kj", format: (v) => Math.round(v / 1000).toLocaleString() },
  { key: "calories", label: "Calories", unit: "kcal", format: (v) => Math.round(v).toLocaleString() },
  { key: "strive_score", label: "Strive Score", unit: "pts", format: (v) => v.toFixed(1) },
  { key: "distance", label: "Distance", unit: "mi", format: (v) => v.toFixed(2) },
  { key: "avg_output", label: "Avg Output", unit: "watts", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_heart_rate", label: "Avg Heart Rate", unit: "bpm", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_cadence", label: "Avg Cadence", unit: "rpm", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_speed", label: "Avg Speed", unit: "mph", format: (v) => v.toFixed(1) },
];

/** Build a widget at position (x, y) with auto-sized defaults. */
export function makeWidget(type: WidgetType, config: WidgetConfig, x: number, y: number, wOverride?: number, hOverride?: number): DashboardWidget {
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

export function buildDefaultInsightsWidgets(): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  let y = 0;

  widgets.push(makeWidget("section", { type: "section", title: "Overview" }, 0, y));
  y += 2;

  const metrics = [
    { metric: "total_workouts", label: "Total Workouts" },
    { metric: "total_hours", label: "Total Hours" },
    { metric: "total_calories", label: "Total Calories" },
    { metric: "total_output_kj", label: "Total Output (kj)" },
    { metric: "total_distance", label: "Total Distance" },
  ];
  for (let i = 0; i < metrics.length; i++) {
    widgets.push(makeWidget("metric_total", {
      type: "metric_total",
      metric: metrics[i].metric,
      label: metrics[i].label,
      filters: [],
    }, i * 4, y, 4, 3));
  }
  y += 3;

  widgets.push(makeWidget("activity_grid", {
    type: "activity_grid",
    title: "Workout Activity",
    metric: "workout_count",
    color: "#216e39",
    filters: [],
  }, 0, y, 24, 5));
  y += 5;

  widgets.push(makeWidget("section", { type: "section", title: "Personal Records" }, 0, y));
  y += 2;

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
    }, i * 8, y, 8, 4));
  }
  y += 4;

  widgets.push(makeWidget("section", { type: "section", title: "Favorites" }, 0, y));
  y += 2;

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
  }, 0, y, 12, 12));

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
  }, 12, y, 12, 12));
  y += 12;

  widgets.push(makeWidget("section", { type: "section", title: "Most Repeated" }, 0, y));
  y += 2;

  widgets.push(makeWidget("most_repeated", {
    type: "most_repeated",
    title: "Most Repeated Rides",
    limit: 10,
    filters: [],
  }, 0, y, 12, 10));

  return widgets;
}
