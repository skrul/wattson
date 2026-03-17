import Database from "@tauri-apps/plugin-sql";
import type { Workout, WorkoutFilters, FilterCondition, UserProfile, WorkoutMetrics, ChartDefinition, ChartDefinitionRow, ChartXAxisMode } from "../types";
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
         avg_output, calories, distance, avg_heart_rate, avg_cadence,
         avg_resistance, avg_speed, strive_score, is_live, workout_type,
         total_work, source, raw_json, raw_detail_json, raw_performance_graph_json,
         raw_ride_details_json, ride_id, class_type, class_subtype, class_type_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [
        w.id, w.peloton_id, w.date, w.duration_seconds, w.discipline,
        w.title, w.instructor, w.avg_output, w.calories, w.distance,
        w.avg_heart_rate, w.avg_cadence, w.avg_resistance, w.avg_speed,
        w.strive_score, w.is_live, w.workout_type, w.total_work,
        w.source, w.raw_json, w.raw_detail_json, w.raw_performance_graph_json,
        w.raw_ride_details_json, w.ride_id, w.class_type, w.class_subtype, w.class_type_version,
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
  if (cond.operator === "last_n_days") return cond.value !== "" && !isNaN(Number(cond.value));
  if (cond.operator === "between") return cond.values.length === 2 && cond.values[0] !== "" && cond.values[1] !== "";
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

  if (field.buildClause) {
    return field.buildClause(cond, params, idx);
  }

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
    case "last_n_days": {
      const nDaysAgo = Math.floor(Date.now() / 1000) - Number(cond.value) * 86400;
      params.push(nDaysAgo);
      return `${col} >= $${idx.val++}`;
    }
    case "between": {
      const startTs = dateToTimestamp(cond.values[0]);
      const endTs = dateToTimestamp(cond.values[1]) + 86399; // end of day
      params.push(startTs, endTs);
      const p1 = `$${idx.val++}`;
      const p2 = `$${idx.val++}`;
      return `${col} >= ${p1} AND ${col} <= ${p2}`;
    }
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
    const searchCols = ["title", "instructor", "discipline", "workout_type", "class_type", "class_subtype"];
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
  Object.values(FIELD_MAP).filter((f) => f.type === "enum" && !f.staticValues).map((f) => f.key),
);

/** Get sorted distinct non-null values for an enum column. */
export async function getDistinctValues(column: string): Promise<string[]> {
  if (!DISTINCT_VALUE_COLUMNS.has(column)) {
    throw new Error(`Column "${column}" is not allowed for distinct values`);
  }
  const field = FIELD_MAP[column];
  const extraFilter = field?.distinctFilter ? ` AND ${field.distinctFilter}` : "";
  const d = await getDb();
  const rows = await d.select<Record<string, string>[]>(
    `SELECT DISTINCT ${column} FROM workouts WHERE ${column} IS NOT NULL AND ${column} != ''${extraFilter} ORDER BY ${column} ASC`,
  );
  return rows.map((r) => r[column]);
}

/** Get all existing workout IDs from the database. */
export async function getExistingWorkoutIds(): Promise<Set<string>> {
  const d = await getDb();
  const rows = await d.select<{ id: string }[]>("SELECT id FROM workouts");
  return new Set(rows.map((r) => r.id));
}

/** Insert or replace a user profile. */
export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO user_profile (id, first_name, total_workouts, raw_json)
     VALUES ($1, $2, $3, $4)`,
    [profile.id, profile.first_name, profile.total_workouts, profile.raw_json],
  );
}

/** Get a cached user profile by ID. */
export async function getUserProfile(id: string): Promise<UserProfile | null> {
  const d = await getDb();
  const rows = await d.select<UserProfile[]>(
    "SELECT * FROM user_profile WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** Check whether any workouts exist in the database. */
export async function hasWorkouts(): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<{ exists_flag: number }[]>(
    "SELECT EXISTS(SELECT 1 FROM workouts) as exists_flag"
  );
  return (rows[0]?.exists_flag ?? 0) === 1;
}

/** Get total number of workouts. */
export async function getWorkoutCount(): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ count: number }[]>("SELECT COUNT(*) as count FROM workouts");
  return rows[0].count;
}

/** Delete all user data from the database. */
export async function deleteAllData(): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM user_profile");
  await d.execute("DELETE FROM workouts");
}

/** Update a workout's summary metrics and raw JSON (fetched from detail + performance_graph). */
export async function updateWorkoutMetrics(
  workoutId: string,
  metrics: WorkoutMetrics,
  rawDetailJson: string | null,
  rawPerformanceGraphJson: string | null,
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE workouts SET calories=$1, distance=$2, avg_output=$3, avg_cadence=$4,
     avg_resistance=$5, avg_speed=$6, avg_heart_rate=$7,
     raw_detail_json=$8, raw_performance_graph_json=$9 WHERE id=$10`,
    [
      metrics.calories, metrics.distance, metrics.avg_output, metrics.avg_cadence,
      metrics.avg_resistance, metrics.avg_speed, metrics.avg_heart_rate,
      rawDetailJson, rawPerformanceGraphJson, workoutId,
    ],
  );
}

/** Update a workout's cached ride details JSON. */
export async function updateRideDetails(workoutId: string, rawJson: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE workouts SET raw_ride_details_json=$1 WHERE id=$2`,
    [rawJson, workoutId],
  );
}

// --- Chart definitions ---

function rowToChart(row: ChartDefinitionRow): ChartDefinition {
  return {
    id: row.id,
    name: row.name,
    mark_type: row.mark_type as ChartDefinition["mark_type"],
    y_fields: JSON.parse(row.y_fields_json),
    group_by: row.group_by,
    filters: JSON.parse(row.filters_json),
    x_axis_mode: (row.x_axis_mode ?? "date") as ChartXAxisMode,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Get all saved chart definitions, newest first. */
export async function getAllChartDefinitions(): Promise<ChartDefinition[]> {
  const d = await getDb();
  const rows = await d.select<ChartDefinitionRow[]>(
    "SELECT * FROM chart_definitions ORDER BY updated_at DESC",
  );
  return rows.map(rowToChart);
}

/** Insert or replace a chart definition. */
export async function saveChartDefinition(chart: ChartDefinition): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO chart_definitions
      (id, name, mark_type, y_fields_json, group_by, filters_json, x_axis_mode, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      chart.id,
      chart.name,
      chart.mark_type,
      JSON.stringify(chart.y_fields),
      chart.group_by,
      JSON.stringify(chart.filters),
      chart.x_axis_mode,
      chart.created_at,
      chart.updated_at,
    ],
  );
}

/** Delete a chart definition by id. */
export async function deleteChartDefinition(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM chart_definitions WHERE id = $1", [id]);
}

/** Find all workouts that share the same Peloton ride ID (same class). */
export async function getWorkoutsByRideId(rideId: string): Promise<Workout[]> {
  const d = await getDb();
  return await d.select<Workout[]>(
    `SELECT * FROM workouts WHERE ride_id = $1 ORDER BY date DESC`,
    [rideId],
  );
}

// --- Settings ---

/** Read a value from the settings table. */
export async function getSetting(key: string): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Insert or update a value in the settings table. */
export async function setSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
    [key, value],
  );
}

/** Get IDs of workouts that have not been enriched with performance graph data. */
export async function getUnenrichedWorkoutIds(): Promise<string[]> {
  const d = await getDb();
  const rows = await d.select<{ id: string }[]>(
    "SELECT id FROM workouts WHERE raw_performance_graph_json IS NULL ORDER BY date DESC",
  );
  return rows.map((r) => r.id);
}

/** Get counts of enriched vs total workouts. */
export async function getEnrichmentCounts(): Promise<{ enriched: number; total: number }> {
  const d = await getDb();
  const rows = await d.select<{ total: number; enriched: number }[]>(
    "SELECT COUNT(*) as total, COUNT(raw_performance_graph_json) as enriched FROM workouts",
  );
  return { enriched: rows[0].enriched, total: rows[0].total };
}

/** Wrap chart filter conditions into a WorkoutFilters for querying. */
export function chartFiltersToWorkoutFilters(conditions: FilterCondition[]): WorkoutFilters {
  return {
    conditions,
    sort: { field: "date", direction: "asc" },
    search: "",
  };
}

// --- Insights queries ---

export interface DisciplineCount {
  discipline: string;
  count: number;
}

export interface DurationCount {
  duration_seconds: number;
  count: number;
}

export interface ClassTypeCount {
  class_type: string;
  count: number;
}

export interface InstructorCount {
  instructor: string;
  count: number;
}

export interface RepeatedRide {
  ride_id: string;
  title: string;
  instructor: string | null;
  count: number;
  workout_id: string;
}

export type RepeatedRideWorkout = Workout & { repeat_count: number };

/** Count workouts per discipline, ordered by count DESC. */
export async function getDisciplineCounts(): Promise<DisciplineCount[]> {
  const d = await getDb();
  return d.select<DisciplineCount[]>(
    `SELECT discipline, COUNT(*) as count FROM workouts
     WHERE discipline IS NOT NULL AND discipline != ''
     GROUP BY discipline ORDER BY count DESC`,
  );
}

/** Count workouts per duration for a given discipline, ordered by count DESC. */
export async function getDurationCounts(discipline: string): Promise<DurationCount[]> {
  const d = await getDb();
  return d.select<DurationCount[]>(
    `SELECT duration_seconds, COUNT(*) as count FROM workouts
     WHERE discipline = $1 AND duration_seconds IS NOT NULL
     GROUP BY duration_seconds ORDER BY count DESC`,
    [discipline],
  );
}

/** Count workouts per class_type for a given discipline, ordered by count DESC. */
export async function getClassTypeCounts(discipline: string): Promise<ClassTypeCount[]> {
  const d = await getDb();
  return d.select<ClassTypeCount[]>(
    `SELECT class_type, COUNT(*) as count FROM workouts
     WHERE discipline = $1 AND class_type IS NOT NULL AND class_type != ''
     GROUP BY class_type ORDER BY count DESC`,
    [discipline],
  );
}

const METRIC_ALLOWLIST = new Set([
  "total_work", "avg_output", "calories", "distance",
  "avg_heart_rate", "avg_cadence", "avg_speed", "strive_score",
]);

/** Count workouts per class_subtype for a given discipline and class_type, ordered by count DESC. */
export async function getClassSubtypeCounts(discipline: string, classType: string): Promise<ClassSubtypeCount[]> {
  const d = await getDb();
  return d.select<ClassSubtypeCount[]>(
    `SELECT class_subtype, COUNT(*) as count FROM workouts
     WHERE discipline = $1 AND class_type = $2 AND class_subtype IS NOT NULL AND class_subtype != ''
     GROUP BY class_subtype ORDER BY count DESC`,
    [discipline, classType],
  );
}

export interface ClassSubtypeCount {
  class_subtype: string;
  count: number;
}

export interface TopWorkoutFilters {
  discipline?: string;
  classType?: string;
  classSubtype?: string;
  durationSeconds?: number;
}

/** Get top N workouts by a given metric, with optional filters. */
export async function getTopWorkouts(
  metric: string,
  limit: number,
  filters?: TopWorkoutFilters,
): Promise<Workout[]> {
  if (!METRIC_ALLOWLIST.has(metric)) {
    throw new Error(`Metric "${metric}" is not allowed`);
  }
  const clauses = [`${metric} IS NOT NULL`];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.discipline) {
    clauses.push(`discipline = $${idx++}`);
    params.push(filters.discipline);
  }
  if (filters?.classType) {
    clauses.push(`class_type = $${idx++}`);
    params.push(filters.classType);
  }
  if (filters?.classSubtype) {
    clauses.push(`class_subtype = $${idx++}`);
    params.push(filters.classSubtype);
  }
  if (filters?.durationSeconds != null) {
    clauses.push(`duration_seconds = $${idx++}`);
    params.push(filters.durationSeconds);
  }

  params.push(limit);
  const d = await getDb();
  return d.select<Workout[]>(
    `SELECT * FROM workouts WHERE ${clauses.join(" AND ")}
     ORDER BY ${metric} DESC LIMIT $${idx}`,
    params,
  );
}

/** Top instructors by workout count. */
export async function getTopInstructors(limit: number): Promise<InstructorCount[]> {
  const d = await getDb();
  return d.select<InstructorCount[]>(
    `SELECT instructor, COUNT(*) as count FROM workouts
     WHERE instructor IS NOT NULL AND instructor != ''
     GROUP BY instructor ORDER BY count DESC LIMIT $1`,
    [limit],
  );
}

/** Top class types by workout count. */
export async function getTopClassTypes(limit: number): Promise<ClassTypeCount[]> {
  const d = await getDb();
  return d.select<ClassTypeCount[]>(
    `SELECT class_type, COUNT(*) as count FROM workouts
     WHERE class_type IS NOT NULL AND class_type != ''
     GROUP BY class_type ORDER BY count DESC LIMIT $1`,
    [limit],
  );
}

/** Most repeated rides (same ride_id taken multiple times), with most recent workout ID. */
export async function getMostRepeatedRides(limit: number): Promise<RepeatedRide[]> {
  const d = await getDb();
  return d.select<RepeatedRide[]>(
    `SELECT w.ride_id, w.title, w.instructor, g.count, w.id as workout_id
     FROM workouts w
     INNER JOIN (
       SELECT ride_id, COUNT(*) as count, MAX(date) as max_date
       FROM workouts
       WHERE ride_id IS NOT NULL AND ride_id != ''
       GROUP BY ride_id
       HAVING count > 1
     ) g ON w.ride_id = g.ride_id AND w.date = g.max_date
     ORDER BY g.count DESC, g.max_date DESC
     LIMIT $1`,
    [limit],
  );
}

/** Most repeated rides returning full Workout rows plus repeat count. */
export async function getMostRepeatedRideWorkouts(limit: number): Promise<RepeatedRideWorkout[]> {
  const d = await getDb();
  return d.select<RepeatedRideWorkout[]>(
    `SELECT w.*, g.count as repeat_count
     FROM workouts w
     INNER JOIN (
       SELECT ride_id, COUNT(*) as count, MAX(date) as max_date
       FROM workouts
       WHERE ride_id IS NOT NULL AND ride_id != ''
       GROUP BY ride_id
       HAVING count > 1
     ) g ON w.ride_id = g.ride_id AND w.date = g.max_date
     ORDER BY g.count DESC, g.max_date DESC
     LIMIT $1`,
    [limit],
  );
}

/** Most repeated rides for a specific discipline, returning full Workout rows plus repeat count. */
export async function getMostRepeatedRideWorkoutsByDiscipline(
  discipline: string,
  limit: number,
): Promise<RepeatedRideWorkout[]> {
  const d = await getDb();
  return d.select<RepeatedRideWorkout[]>(
    `SELECT w.*, g.count as repeat_count
     FROM workouts w
     INNER JOIN (
       SELECT ride_id, COUNT(*) as count, MAX(date) as max_date
       FROM workouts
       WHERE ride_id IS NOT NULL AND ride_id != ''
         AND discipline = $1
       GROUP BY ride_id
       HAVING count > 1
     ) g ON w.ride_id = g.ride_id AND w.date = g.max_date
     WHERE w.discipline = $1
     ORDER BY g.count DESC, g.max_date DESC
     LIMIT $2`,
    [discipline, limit],
  );
}
