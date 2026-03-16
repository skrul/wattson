/** A single workout summary (one row in the workouts table). */
export interface Workout {
  id: string;
  peloton_id: string | null;
  date: number; // Unix timestamp
  duration_seconds: number | null;
  discipline: string;
  title: string;
  instructor: string | null;
  avg_output: number | null;
  calories: number | null;
  distance: number | null;
  avg_heart_rate: number | null;
  avg_cadence: number | null;
  avg_resistance: number | null;
  avg_speed: number | null;
  strive_score: number | null;
  is_live: number | null;
  workout_type: string | null;
  total_work: number | null;
  source: "api";
  raw_json: string | null;
  raw_detail_json: string | null;
  raw_performance_graph_json: string | null;
  raw_ride_details_json: string | null;
  ride_id: string | null;
  class_type: string | null;
  class_subtype: string | null;
  class_type_version: number | null;
}

/** Metrics fetched on-demand from the performance_graph endpoint. */
export interface WorkoutMetrics {
  calories: number | null;
  distance: number | null;
  avg_output: number | null;
  avg_cadence: number | null;
  avg_resistance: number | null;
  avg_speed: number | null;
  avg_heart_rate: number | null;
}

/** Per-second time series data parsed from raw_performance_graph_json. */
export interface PerformanceTimeSeries {
  seconds: number[];
  output: number[];
  cadence: number[];
  resistance: number[];
  heartRate: number[];
  speed: number[];
}

/** Cached user profile from /api/me. */
export interface UserProfile {
  id: string;
  first_name: string | null;
  total_workouts: number | null;
  raw_json: string;
}

export type FieldType = "string" | "number" | "date" | "enum";

export type FilterOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "gt" | "gte" | "lt" | "lte"
  | "before" | "after"
  | "last_n_days" | "between"
  | "is_empty" | "is_not_empty";

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  values: string[];
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

/** Filters applied to the workout list. */
export interface WorkoutFilters {
  conditions: FilterCondition[];
  sort: SortSpec;
  search: string;
}

// --- Chart definitions ---

export type YAxisSide = "left" | "right";
export type ChartMarkType = "line" | "dot" | "bar";
export type ChartXAxisMode = "date" | "workout";

export interface YAxisField {
  field: string;      // numeric field key from FIELD_DEFS
  side: YAxisSide;
}

export interface ChartDefinition {
  id: string;
  name: string;
  mark_type: ChartMarkType;
  y_fields: YAxisField[];         // 1-2 fields
  group_by: string | null;        // enum field key for color coding
  filters: FilterCondition[];     // reuses existing type
  x_axis_mode: ChartXAxisMode;
  created_at: number;
  updated_at: number;
}

/** Row shape as stored in SQLite (JSON fields are strings). */
export interface ChartDefinitionRow {
  id: string;
  name: string;
  mark_type: string;
  y_fields_json: string;
  group_by: string | null;
  filters_json: string;
  x_axis_mode: string | null;
  created_at: number;
  updated_at: number;
}
