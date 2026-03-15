import Database from "@tauri-apps/plugin-sql";
import type { Workout, MetricSample, WorkoutFilters, FilterCondition } from "../types";
import { FIELD_MAP } from "./fields";

let db: Database | null = null;

/** Get or initialize the database connection. */
export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:wattson.db");
  }
  return db;
}

/** Insert workouts from the API. */
export async function insertWorkouts(workouts: Workout[]): Promise<void> {
  const d = await getDb();
  for (const w of workouts) {
    await d.execute(
      `INSERT OR REPLACE INTO workouts
        (id, peloton_id, date, duration_seconds, discipline, title, instructor,
         output_watts, calories, distance, avg_heart_rate, avg_cadence,
         avg_resistance, avg_speed, strive_score, is_live, workout_type,
         total_output, avg_incline, avg_pace, source, raw_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        w.id, w.peloton_id, w.date, w.duration_seconds, w.discipline,
        w.title, w.instructor, w.output_watts, w.calories, w.distance,
        w.avg_heart_rate, w.avg_cadence, w.avg_resistance, w.avg_speed,
        w.strive_score, w.is_live, w.workout_type, w.total_output,
        w.avg_incline, w.avg_pace, w.source, w.raw_json,
      ],
    );
  }
}

const SORTABLE_COLUMNS = new Set<string>(
  Object.values(FIELD_MAP).filter((f) => f.sortable).map((f) => f.key),
);

const FILTERABLE_COLUMNS = new Set<string>(
  Object.values(FIELD_MAP).filter((f) => f.filterable).map((f) => f.key),
);

function isConditionComplete(cond: FilterCondition): boolean {
  if (cond.operator === "is_empty" || cond.operator === "is_not_empty") return true;
  const field = FIELD_MAP[cond.field];
  if (field?.type === "enum") return cond.values.length > 0;
  return cond.value !== "";
}

function buildConditionClause(
  cond: FilterCondition,
  params: unknown[],
  idx: { val: number },
): string | null {
  const field = FIELD_MAP[cond.field];
  if (!field || !FILTERABLE_COLUMNS.has(cond.field)) return null;
  if (!isConditionComplete(cond)) return null;

  const col = cond.field;

  switch (cond.operator) {
    case "is_empty":
      return `(${col} IS NULL OR ${col} = '')`;
    case "is_not_empty":
      return `(${col} IS NOT NULL AND ${col} != '')`;
    case "equals":
      if (field.type === "enum" && cond.values.length > 0) {
        const placeholders = cond.values.map(() => `$${idx.val++}`);
        params.push(...cond.values);
        return `${col} IN (${placeholders.join(", ")})`;
      }
      if (field.type === "number") {
        params.push(parseFloat(cond.value));
      } else if (field.type === "date") {
        params.push(dateToTimestamp(cond.value));
      } else {
        params.push(cond.value);
      }
      return `${col} = $${idx.val++}`;
    case "not_equals":
      if (field.type === "enum" && cond.values.length > 0) {
        const placeholders = cond.values.map(() => `$${idx.val++}`);
        params.push(...cond.values);
        return `${col} NOT IN (${placeholders.join(", ")})`;
      }
      if (field.type === "number") {
        params.push(parseFloat(cond.value));
      } else if (field.type === "date") {
        params.push(dateToTimestamp(cond.value));
      } else {
        params.push(cond.value);
      }
      return `${col} != $${idx.val++}`;
    case "contains":
      params.push(`%${cond.value}%`);
      return `${col} LIKE $${idx.val++}`;
    case "not_contains":
      params.push(`%${cond.value}%`);
      return `${col} NOT LIKE $${idx.val++}`;
    case "starts_with":
      params.push(`${cond.value}%`);
      return `${col} LIKE $${idx.val++}`;
    case "ends_with":
      params.push(`%${cond.value}`);
      return `${col} LIKE $${idx.val++}`;
    case "gt":
      params.push(parseFloat(cond.value));
      return `${col} > $${idx.val++}`;
    case "gte":
      params.push(parseFloat(cond.value));
      return `${col} >= $${idx.val++}`;
    case "lt":
      params.push(parseFloat(cond.value));
      return `${col} < $${idx.val++}`;
    case "lte":
      params.push(parseFloat(cond.value));
      return `${col} <= $${idx.val++}`;
    case "before":
      params.push(dateToTimestamp(cond.value));
      return `${col} < $${idx.val++}`;
    case "after":
      params.push(dateToTimestamp(cond.value));
      return `${col} > $${idx.val++}`;
    default:
      return null;
  }
}

function dateToTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00").getTime() / 1000);
}

/** Query workouts with optional filters. */
export async function queryWorkouts(filters: WorkoutFilters): Promise<Workout[]> {
  const d = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];
  const idx = { val: 1 };

  for (const cond of filters.conditions) {
    const clause = buildConditionClause(cond, params, idx);
    if (clause) clauses.push(clause);
  }

  if (filters.search) {
    const searchCols = ["title", "instructor", "discipline", "workout_type"];
    const orParts = searchCols.map((col) => {
      params.push(`%${filters.search}%`);
      return `${col} LIKE $${idx.val++}`;
    });
    clauses.push(`(${orParts.join(" OR ")})`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sortCol = filters.sort?.field && SORTABLE_COLUMNS.has(filters.sort.field)
    ? filters.sort.field : "date";
  const sortDir = filters.sort?.direction === "asc" ? "ASC" : "DESC";

  return await d.select<Workout[]>(
    `SELECT * FROM workouts ${where} ORDER BY ${sortCol} ${sortDir}`,
    params,
  );
}

const DISTINCT_VALUE_COLUMNS = new Set<string>(
  Object.values(FIELD_MAP).filter((f) => f.type === "enum").map((f) => f.key),
);

/** Get sorted distinct non-null values for an enum column. */
export async function getDistinctValues(column: string): Promise<string[]> {
  if (!DISTINCT_VALUE_COLUMNS.has(column)) {
    throw new Error(`Column "${column}" is not allowed for distinct values`);
  }
  const d = await getDb();
  const rows = await d.select<Record<string, string>[]>(
    `SELECT DISTINCT ${column} FROM workouts WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY ${column} ASC`,
  );
  return rows.map((r) => r[column]);
}

/** Get all existing workout IDs from the database. */
export async function getExistingWorkoutIds(): Promise<Set<string>> {
  const d = await getDb();
  const rows = await d.select<{ id: string }[]>("SELECT id FROM workouts");
  return new Set(rows.map((r) => r.id));
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
