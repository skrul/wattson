/** A single workout summary (one row in the workouts table). */
export interface Workout {
  id: string;
  peloton_id: string | null;
  date: number; // Unix timestamp
  duration_seconds: number;
  discipline: string;
  title: string;
  instructor: string | null;
  output_watts: number | null;
  calories: number | null;
  distance: number | null;
  avg_heart_rate: number | null;
  avg_cadence: number | null;
  avg_resistance: number | null;
  avg_speed: number | null;
  strive_score: number | null;
  is_live: number | null;
  workout_type: string | null;
  total_output: number | null;
  avg_incline: number | null;
  avg_pace: number | null;
  source: "csv" | "api";
  raw_json: string | null;
}

/** Cached user profile from /api/me. */
export interface UserProfile {
  id: string;
  first_name: string | null;
  total_workouts: number | null;
  raw_json: string;
}

/** A single per-second metric sample for a workout. */
export interface MetricSample {
  workout_id: string;
  second: number;
  output: number | null;
  cadence: number | null;
  resistance: number | null;
  heart_rate: number | null;
  speed: number | null;
}

export type FieldType = "string" | "number" | "date" | "enum";

export type FilterOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "gt" | "gte" | "lt" | "lte"
  | "before" | "after"
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
