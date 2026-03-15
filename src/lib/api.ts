import { fetch } from "@tauri-apps/plugin-http";
import type { Workout, MetricSample } from "../types";

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
  total_work: number;
}

function mapWorkout(w: PelotonWorkout): Workout {
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
    strive_score: null,
    is_live: w.ride?.is_live_in_studio_only != null ? (w.ride.is_live_in_studio_only ? 0 : 1) : null,
    workout_type: null,
    total_output: null,
    avg_incline: null,
    avg_pace: null,
    source: "api",
  };
}

/**
 * Fetch new workouts for a user, stopping when we reach already-synced data.
 * If `since` is provided (unix timestamp), stops paginating once all workouts
 * on a page are older than that date (API returns newest first).
 * Calls onProgress with (fetched, total) after each page.
 */
export async function fetchAllWorkouts(
  userId: string,
  accessToken: string,
  onProgress?: (fetched: number, total: number) => void,
  since?: number | null,
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
      throw new Error(`Fetch workouts failed (${res.status}): ${await res.text()}`);
    }

    const body: PelotonWorkoutResponse = await res.json();
    totalCount = body.total;

    const completed = body.data
      .filter((w) => w.status === "COMPLETE")
      .map(mapWorkout);

    if (since) {
      const newWorkouts = completed.filter((w) => w.date > since);
      all.push(...newWorkouts);
      // If we got fewer new workouts than completed ones, we've hit old data
      if (newWorkouts.length < completed.length) {
        onProgress?.(all.length, all.length);
        break;
      }
    } else {
      all.push(...completed);
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
