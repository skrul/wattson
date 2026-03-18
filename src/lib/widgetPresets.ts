import type { WidgetType, WidgetConfig } from "../types";
import {
  PREDEFINED_METRICS,
  PERSONAL_RECORD_METRICS,
  ACTIVITY_GRID_METRICS,
} from "./dashboardDefaults";

export interface WidgetPreset {
  id: string;
  name: string;
  config: WidgetConfig;
}

export const WIDGET_TYPES: {
  type: WidgetType;
  label: string;
  description: string;
}[] = [
  { type: "metric_total", label: "Metric Total", description: "Display a single aggregate value" },
  { type: "chart", label: "Chart", description: "Custom chart with the chart builder" },
  { type: "last_workout", label: "Last Workout", description: "Performance chart for the most recent matching workout" },
  { type: "activity_grid", label: "Activity Grid", description: "GitHub-style heatmap of daily activity" },
  { type: "personal_record", label: "Personal Record", description: "Top workout for a metric" },
  { type: "most_repeated", label: "Most Repeated", description: "Rides you've taken multiple times" },
  { type: "section", label: "Section", description: "Full-width separator to organize widgets" },
];

// --- Metric Total presets ---
const metricTotalPresets: WidgetPreset[] = PREDEFINED_METRICS.map((m) => ({
  id: `metric_total_${m.key}`,
  name: m.label,
  config: {
    type: "metric_total" as const,
    label: m.label,
    metric: m.key,
    filters: [],
  },
}));

// --- Chart presets ---
const chartPresets: WidgetPreset[] = [
  {
    id: "chart_top_instructors",
    name: "Top Instructors",
    config: {
      type: "chart" as const,
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
    },
  },
  {
    id: "chart_top_class_types",
    name: "Top Class Types",
    config: {
      type: "chart" as const,
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
    },
  },
  {
    id: "chart_output_over_time",
    name: "Output Over Time",
    config: {
      type: "chart" as const,
      chart: {
        name: "Output Over Time",
        mark_type: "line",
        y_fields: [{ field: "avg_output", side: "left" }],
        group_by: null,
        filters: [],
        x_axis_mode: "date",
        x_axis_field: null,
        x_axis_sequential: false,
        agg_function: null,
      },
    },
  },
];

// --- Personal Record presets ---
const personalRecordPresets: WidgetPreset[] = PERSONAL_RECORD_METRICS.map((m) => ({
  id: `pr_${m.key}`,
  name: m.label,
  config: {
    type: "personal_record" as const,
    title: m.label,
    metric: m.key,
    filters: [],
  },
}));

// --- Activity Grid presets ---
const ACTIVITY_GRID_COLORS: Record<string, string> = {
  workout_count: "#216e39",
  total_output: "#7c3aed",
  total_calories: "#ea580c",
  total_distance: "#2563eb",
  total_duration: "#0d9488",
};

const activityGridPresets: WidgetPreset[] = ACTIVITY_GRID_METRICS.map((m) => ({
  id: `grid_${m.key}`,
  name: m.label,
  config: {
    type: "activity_grid" as const,
    title: m.label,
    metric: m.key,
    color: ACTIVITY_GRID_COLORS[m.key] ?? "#216e39",
    filters: [],
  },
}));

// --- Most Repeated presets ---
const mostRepeatedPresets: WidgetPreset[] = [
  {
    id: "most_repeated_top10",
    name: "Top 10 Most Repeated",
    config: {
      type: "most_repeated" as const,
      title: "Most Repeated Rides",
      limit: 10,
      filters: [],
    },
  },
];

// --- Last Workout presets ---
const lastWorkoutPresets: WidgetPreset[] = [
  {
    id: "last_workout_cycling",
    name: "Last Cycling Workout",
    config: {
      type: "last_workout" as const,
      title: "Last Cycling Workout",
      filters: [
        { id: "preset-cycling", field: "discipline", operator: "equals", value: "cycling", values: ["cycling"] },
      ],
    },
  },
];

export const WIDGET_PRESETS: Record<WidgetType, WidgetPreset[]> = {
  metric_total: metricTotalPresets,
  chart: chartPresets,
  personal_record: personalRecordPresets,
  activity_grid: activityGridPresets,
  most_repeated: mostRepeatedPresets,
  last_workout: lastWorkoutPresets,
  section: [],
};
