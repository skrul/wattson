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
  activity_grid: { defaultW: 12, defaultH: 3, minW: 6, minH: 2 },
  personal_record: { defaultW: 4, defaultH: 3, minW: 3, minH: 3 },
  most_repeated: { defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
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
