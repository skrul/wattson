import Database from "@tauri-apps/plugin-sql";
import type { WorkoutMetrics } from "../types";
import { fetchPerformanceGraph, fetchWorkoutDetail, fetchRideDetails } from "./api";

let cacheDb: Database | null = null;

async function getCache(): Promise<Database> {
  if (!cacheDb) {
    cacheDb = await Database.load("sqlite:enrichment_cache.db");
    await cacheDb.execute(
      `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      )`,
    );
  }
  return cacheDb;
}

async function getCached(key: string): Promise<string | null> {
  const db = await getCache();
  const rows = await db.select<{ raw_json: string }[]>(
    "SELECT raw_json FROM cache WHERE key = $1",
    [key],
  );
  return rows[0]?.raw_json ?? null;
}

/** Delete all entries from the enrichment cache. */
export async function clearCache(): Promise<void> {
  const db = await getCache();
  await db.execute("DELETE FROM cache");
}

async function setCache(key: string, rawJson: string): Promise<void> {
  const db = await getCache();
  await db.execute(
    "INSERT OR REPLACE INTO cache (key, raw_json) VALUES ($1, $2)",
    [key, rawJson],
  );
}

/** Parse metrics from cached raw performance graph JSON. */
function parseMetrics(rawJson: string): WorkoutMetrics {
  const data = JSON.parse(rawJson);

  const findSummary = (arr: { slug: string; value: number }[] | undefined, slug: string) =>
    arr?.find((s) => s.slug === slug)?.value ?? null;

  const heartRateMetric = (data.metrics as { slug: string; average_value: number; max_value?: number }[] | undefined)
    ?.find((m) => m.slug === "heart_rate");

  const maxHeartRate = heartRateMetric?.max_value ?? null;

  // Extract HR zone percentages
  let hr_zone1_pct: number | null = null;
  let hr_zone2_pct: number | null = null;
  let hr_zone3_pct: number | null = null;
  let hr_zone4_pct: number | null = null;
  let hr_zone5_pct: number | null = null;

  const zoneDurations = data.effort_zones?.heart_rate_zone_durations as
    { heart_rate_z1_duration?: number; heart_rate_z2_duration?: number; heart_rate_z3_duration?: number; heart_rate_z4_duration?: number; heart_rate_z5_duration?: number } | undefined;

  if (zoneDurations) {
    const z1 = zoneDurations.heart_rate_z1_duration ?? 0;
    const z2 = zoneDurations.heart_rate_z2_duration ?? 0;
    const z3 = zoneDurations.heart_rate_z3_duration ?? 0;
    const z4 = zoneDurations.heart_rate_z4_duration ?? 0;
    const z5 = zoneDurations.heart_rate_z5_duration ?? 0;
    const total = z1 + z2 + z3 + z4 + z5;
    if (total > 0) {
      hr_zone1_pct = (z1 / total) * 100;
      hr_zone2_pct = (z2 / total) * 100;
      hr_zone3_pct = (z3 / total) * 100;
      hr_zone4_pct = (z4 / total) * 100;
      hr_zone5_pct = (z5 / total) * 100;
    }
  }

  return {
    calories: findSummary(data.summaries, "calories"),
    distance: findSummary(data.summaries, "distance"),
    avg_output: findSummary(data.average_summaries, "avg_output"),
    avg_cadence: findSummary(data.average_summaries, "avg_cadence"),
    avg_resistance: findSummary(data.average_summaries, "avg_resistance"),
    avg_speed: findSummary(data.average_summaries, "avg_speed"),
    avg_heart_rate: heartRateMetric?.average_value ?? null,
    max_heart_rate: maxHeartRate,
    hr_zone1_pct,
    hr_zone2_pct,
    hr_zone3_pct,
    hr_zone4_pct,
    hr_zone5_pct,
  };
}

/** Fetch performance graph with cache. Returns cacheHit flag so callers can skip rate limiting. */
export async function cachedFetchPerformanceGraph(
  workoutId: string,
  accessToken: string,
): Promise<WorkoutMetrics & { rawJson: string; cacheHit: boolean }> {
  const key = `perf:${workoutId}`;
  const cached = await getCached(key);
  if (cached) {
    return { ...parseMetrics(cached), rawJson: cached, cacheHit: true };
  }

  const result = await fetchPerformanceGraph(workoutId, accessToken);
  await setCache(key, result.rawJson);
  return { ...parseMetrics(result.rawJson), rawJson: result.rawJson, cacheHit: false };
}

/** Fetch workout detail with cache. */
export async function cachedFetchWorkoutDetail(
  workoutId: string,
  accessToken: string,
): Promise<{ rawJson: string; cacheHit: boolean }> {
  const key = `detail:${workoutId}`;
  const cached = await getCached(key);
  if (cached) return { rawJson: cached, cacheHit: true };

  const rawJson = await fetchWorkoutDetail(workoutId, accessToken);
  await setCache(key, rawJson);
  return { rawJson, cacheHit: false };
}

/** Fetch ride details with cache. */
export async function cachedFetchRideDetails(
  rideId: string,
  accessToken: string,
): Promise<{ rawJson: string; cacheHit: boolean }> {
  const key = `ride:${rideId}`;
  const cached = await getCached(key);
  if (cached) return { rawJson: cached, cacheHit: true };

  const rawJson = await fetchRideDetails(rideId, accessToken);
  await setCache(key, rawJson);
  return { rawJson, cacheHit: false };
}
