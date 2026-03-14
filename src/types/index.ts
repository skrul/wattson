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
  source: "csv" | "api";
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

/** Filters applied to the workout list. */
export interface WorkoutFilters {
  discipline?: string;
  instructor?: string;
  minDuration?: number;
  maxDuration?: number;
  sortBy?: keyof Workout;
  sortOrder?: "asc" | "desc";
}
