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

  const heartRateMetric = (data.metrics as { slug: string; average_value: number }[] | undefined)
    ?.find((m) => m.slug === "heart_rate");

  return {
    calories: findSummary(data.summaries, "calories"),
    distance: findSummary(data.summaries, "distance"),
    avg_output: findSummary(data.average_summaries, "avg_output"),
    avg_cadence: findSummary(data.average_summaries, "avg_cadence"),
    avg_resistance: findSummary(data.average_summaries, "avg_resistance"),
    avg_speed: findSummary(data.average_summaries, "avg_speed"),
    avg_heart_rate: heartRateMetric?.average_value ?? null,
  };
}

/** Fetch performance graph with cache. */
export async function cachedFetchPerformanceGraph(
  workoutId: string,
  accessToken: string,
): Promise<WorkoutMetrics & { rawJson: string }> {
  const key = `perf:${workoutId}`;
  const cached = await getCached(key);
  if (cached) {
    return { ...parseMetrics(cached), rawJson: cached };
  }

  const result = await fetchPerformanceGraph(workoutId, accessToken);
  await setCache(key, result.rawJson);
  return result;
}

/** Fetch workout detail with cache. */
export async function cachedFetchWorkoutDetail(
  workoutId: string,
  accessToken: string,
): Promise<string> {
  const key = `detail:${workoutId}`;
  const cached = await getCached(key);
  if (cached) return cached;

  const rawJson = await fetchWorkoutDetail(workoutId, accessToken);
  await setCache(key, rawJson);
  return rawJson;
}

/** Fetch ride details with cache. */
export async function cachedFetchRideDetails(
  rideId: string,
  accessToken: string,
): Promise<string> {
  const key = `ride:${rideId}`;
  const cached = await getCached(key);
  if (cached) return cached;

  const rawJson = await fetchRideDetails(rideId, accessToken);
  await setCache(key, rawJson);
  return rawJson;
}
