import type { Workout, MetricSample } from "../types";

/**
 * Authenticate with the Peloton API.
 * Returns a session cookie and user ID on success.
 */
export async function login(
  _username: string,
  _password: string,
): Promise<{ userId: string; sessionId: string }> {
  // TODO: implement Peloton API login via Tauri HTTP
  throw new Error("Not implemented");
}

/** Fetch paginated workout list from the Peloton API. */
export async function fetchWorkouts(
  _userId: string,
  _sessionId: string,
  _page: number,
): Promise<Workout[]> {
  // TODO: implement workout list fetch
  return [];
}

/** Fetch per-second performance metrics for a single workout. */
export async function fetchMetrics(
  _workoutId: string,
  _sessionId: string,
): Promise<MetricSample[]> {
  // TODO: implement metrics fetch
  return [];
}
