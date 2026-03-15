import Database from "@tauri-apps/plugin-sql";
import type { Workout, MetricSample, WorkoutFilters } from "../types";

let db: Database | null = null;

/** Get or initialize the database connection. */
export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:wattson.db");
  }
  return db;
}

/** Insert workouts parsed from CSV or API. */
export async function insertWorkouts(workouts: Workout[]): Promise<void> {
  const d = await getDb();
  for (const w of workouts) {
    await d.execute(
      `INSERT OR REPLACE INTO workouts
        (id, peloton_id, date, duration_seconds, discipline, title, instructor,
         output_watts, calories, distance, avg_heart_rate, avg_cadence,
         avg_resistance, avg_speed, strive_score, is_live, workout_type,
         total_output, avg_incline, avg_pace, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        w.id, w.peloton_id, w.date, w.duration_seconds, w.discipline,
        w.title, w.instructor, w.output_watts, w.calories, w.distance,
        w.avg_heart_rate, w.avg_cadence, w.avg_resistance, w.avg_speed,
        w.strive_score, w.is_live, w.workout_type, w.total_output,
        w.avg_incline, w.avg_pace, w.source,
      ],
    );
  }
}

const SORTABLE_COLUMNS = new Set<string>([
  "date", "title", "instructor", "discipline", "duration_seconds",
  "output_watts", "calories", "distance", "avg_heart_rate",
]);

/** Query workouts with optional filters. */
export async function queryWorkouts(filters: WorkoutFilters): Promise<Workout[]> {
  const d = await getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.discipline) {
    conditions.push(`discipline = $${idx++}`);
    params.push(filters.discipline);
  }
  if (filters.instructor) {
    conditions.push(`instructor = $${idx++}`);
    params.push(filters.instructor);
  }
  if (filters.minDuration != null) {
    conditions.push(`duration_seconds >= $${idx++}`);
    params.push(filters.minDuration);
  }
  if (filters.maxDuration != null) {
    conditions.push(`duration_seconds <= $${idx++}`);
    params.push(filters.maxDuration);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = filters.sortBy && SORTABLE_COLUMNS.has(filters.sortBy) ? filters.sortBy : "date";
  const sortDir = filters.sortOrder === "asc" ? "ASC" : "DESC";

  return await d.select<Workout[]>(
    `SELECT * FROM workouts ${where} ORDER BY ${sortCol} ${sortDir}`,
    params,
  );
}

/** Get the most recent workout date (unix timestamp), or null if no workouts. */
export async function getLatestWorkoutDate(): Promise<number | null> {
  const d = await getDb();
  const rows = await d.select<{ max_date: number | null }[]>(
    "SELECT MAX(date) as max_date FROM workouts WHERE source = 'api'",
  );
  return rows[0]?.max_date ?? null;
}

/** Insert per-second metric samples for a workout. */
export async function insertMetrics(_metrics: MetricSample[]): Promise<void> {
  // TODO: implement batch insert
}

/** Fetch per-second metrics for a specific workout. */
export async function getMetrics(_workoutId: string): Promise<MetricSample[]> {
  // TODO: implement query
  return [];
}
