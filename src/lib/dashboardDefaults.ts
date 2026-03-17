import type { WidgetType } from "../types";

export interface WidgetDefaults {
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export const WIDGET_DEFAULTS: Record<WidgetType, WidgetDefaults> = {
  chart: { defaultW: 6, defaultH: 4, minW: 3, minH: 3 },
  metric_total: { defaultW: 3, defaultH: 2, minW: 2, minH: 2 },
  last_workout: { defaultW: 6, defaultH: 5, minW: 4, minH: 4 },
  section: { defaultW: 12, defaultH: 1, minW: 4, minH: 1 },
};

export interface MetricDefinition {
  key: string;
  label: string;
  format: (value: number) => string;
}

export const PREDEFINED_METRICS: MetricDefinition[] = [
  { key: "total_workouts", label: "Total Workouts", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_calories", label: "Total Calories", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_distance", label: "Total Distance", format: (v) => v.toFixed(1) },
  { key: "total_output_kj", label: "Total Output (kj)", format: (v) => Math.round(v).toLocaleString() },
  { key: "total_hours", label: "Total Hours", format: (v) => v.toFixed(1) },
  { key: "avg_output", label: "Avg Output", format: (v) => Math.round(v).toLocaleString() },
  { key: "avg_heart_rate", label: "Avg Heart Rate", format: (v) => Math.round(v).toLocaleString() },
];
