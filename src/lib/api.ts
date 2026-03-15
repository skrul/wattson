import { fetch } from "@tauri-apps/plugin-http";
import type { Workout, MetricSample } from "../types";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const AUTH_URL = "https://auth.onepeloton.com/oauth/token";
const API_BASE = "https://api.onepeloton.com";
const CLIENT_ID = "mgsmWCD0A8Qn6uz6mmqI6qeBNHH9IPwS";
const PAGE_SIZE = 100;

/**
 * Authenticate with the Peloton API via OAuth2.
 * Returns an access token and user ID extracted from the JWT.
 */
export async function login(
  username: string,
  password: string,
): Promise<{ userId: string; accessToken: string }> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "password",
      username,
      password,
      scope: "offline_access openid",
    }).toString(),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Incorrect email or password.");
    }
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const accessToken: string = data.access_token;

  // Decode JWT payload to extract user ID
  const payload = JSON.parse(atob(accessToken.split(".")[1]));
  const userId: string = payload["http://onepeloton.com/user_id"];
  if (!userId) throw new Error("Could not extract user ID from token");

  return { userId, accessToken };
}

interface PelotonWorkoutResponse {
  data: PelotonWorkout[];
  total: number;
  page: number;
  limit: number;
  page_count: number;
}

interface PelotonWorkout {
  id: string;
  status: string;
  created_at: number;
  start_time: number;
  end_time: number;
  fitness_discipline: string;
  is_outdoor: boolean;
  total_work: number;
  workout_type: string | null;
  effort_zones?: {
    total_effort_points: number;
    heart_rate_zone_durations: Record<string, number>;
  } | null;
  ride?: {
    title: string;
    duration: number;
    is_live_in_studio_only: boolean;
    instructor?: {
      name: string;
    };
    fitness_discipline: string;
  };
  is_total_work_personal_record: boolean;
}

function mapWorkout(w: PelotonWorkout, raw: unknown): Workout {
  return {
    id: w.id,
    peloton_id: w.id,
    date: w.created_at,
    duration_seconds: w.ride?.duration ?? (w.end_time - w.start_time),
    discipline: w.fitness_discipline,
    title: w.ride?.title ?? "Just Work Out",
    instructor: w.ride?.instructor?.name ?? null,
    output_watts: null,
    calories: null,
    distance: null,
    avg_heart_rate: null,
    avg_cadence: null,
    avg_resistance: null,
    avg_speed: null,
    strive_score: w.effort_zones?.total_effort_points ?? null,
    is_live: w.ride?.is_live_in_studio_only != null ? (w.ride.is_live_in_studio_only ? 0 : 1) : null,
    workout_type: w.workout_type ?? null,
    total_output: w.total_work ?? null,
    avg_incline: null,
    avg_pace: null,
    source: "api",
    raw_json: JSON.stringify(raw),
  };
}

/**
 * Fetch workouts for a user, stopping when an entire page consists of
 * already-known workout IDs.  Duplicates are safe — the DB uses
 * INSERT OR REPLACE.  Calls onProgress with (fetched, total) after each page.
 */
export async function fetchAllWorkouts(
  userId: string,
  accessToken: string,
  onProgress?: (fetched: number, total: number) => void,
  existingIds?: Set<string>,
): Promise<Workout[]> {
  const all: Workout[] = [];
  let page = 0;
  let totalCount = 0;

  while (true) {
    const url = `${API_BASE}/api/user/${userId}/workouts?joins=ride,ride.instructor&limit=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(`Fetch workouts failed (${res.status}): ${text}`);
      }
      throw new Error(`Fetch workouts failed (${res.status}): ${text}`);
    }

    const body: PelotonWorkoutResponse = await res.json();
    totalCount = body.total;

    const completed = body.data
      .filter((w) => w.status === "COMPLETE")
      .map((w) => mapWorkout(w, w));

    all.push(...completed);

    // If every workout on this page is already in the DB, stop paginating
    if (existingIds && completed.length > 0 && completed.every((w) => existingIds.has(w.id))) {
      onProgress?.(all.length, all.length);
      break;
    }

    onProgress?.(all.length, totalCount);

    if (page >= body.page_count - 1) break;
    page++;
  }

  return all;
}

/** Fetch per-second performance metrics for a single workout. */
export async function fetchMetrics(
  _workoutId: string,
  _accessToken: string,
): Promise<MetricSample[]> {
  // TODO: implement via performance_graph endpoint in a future phase
  return [];
}
