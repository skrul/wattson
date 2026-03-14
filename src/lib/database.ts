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
export async function insertWorkouts(_workouts: Workout[]): Promise<void> {
  // TODO: implement batch insert
}

/** Query workouts with optional filters. */
export async function queryWorkouts(_filters: WorkoutFilters): Promise<Workout[]> {
  // TODO: implement filtered query
  return [];
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
