import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllWorkouts } from "./api";

// Mock @tauri-apps/plugin-http
const mockFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

/** Helper to build a fake PelotonWorkout object. */
function makePelotonWorkout(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    status: "COMPLETE",
    created_at: 1700000000,
    start_time: 1700000000,
    end_time: 1700001800,
    fitness_discipline: "cycling",
    is_outdoor: false,
    total_work: 250000,
    workout_type: "class",
    effort_zones: null,
    ride: {
      title: "30 min Ride",
      duration: 1800,
      is_live_in_studio_only: false,
      instructor: { name: "Cody Rigsby" },
      fitness_discipline: "cycling",
    },
    is_total_work_personal_record: false,
    ...overrides,
  };
}

/** Helper to build a fake API response and wrap it in a Response-like object. */
function makePageResponse(
  workouts: ReturnType<typeof makePelotonWorkout>[],
  opts: { total?: number; page?: number; pageCount?: number } = {},
) {
  const body = {
    data: workouts,
    total: opts.total ?? workouts.length,
    page: opts.page ?? 0,
    limit: 100,
    page_count: opts.pageCount ?? 1,
  };
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function makeErrorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(text),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchAllWorkouts", () => {
  it("fetches all pages when no existingIds provided", async () => {
    const page0 = [makePelotonWorkout("w1"), makePelotonWorkout("w2")];
    const page1 = [makePelotonWorkout("w3")];

    mockFetch.mockResolvedValueOnce(
      makePageResponse(page0, { total: 3, page: 0, pageCount: 2 }),
    );
    mockFetch.mockResolvedValueOnce(
      makePageResponse(page1, { total: 3, page: 1, pageCount: 2 }),
    );

    const result = await fetchAllWorkouts("user1", "token1");

    expect(result).toHaveLength(3);
    expect(result.map((w) => w.id)).toEqual(["w1", "w2", "w3"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops when full page of known IDs encountered", async () => {
    const page0 = [makePelotonWorkout("new1"), makePelotonWorkout("new2")];
    const page1 = [makePelotonWorkout("old1"), makePelotonWorkout("old2")];

    mockFetch.mockResolvedValueOnce(
      makePageResponse(page0, { total: 4, page: 0, pageCount: 3 }),
    );
    mockFetch.mockResolvedValueOnce(
      makePageResponse(page1, { total: 4, page: 1, pageCount: 3 }),
    );

    const existing = new Set(["old1", "old2"]);
    const result = await fetchAllWorkouts("user1", "token1", undefined, existing);

    expect(result).toHaveLength(4);
    // Should NOT have fetched page 2 because page 1 was all known
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when page 0 is all known IDs", async () => {
    const page0 = [makePelotonWorkout("old1"), makePelotonWorkout("old2")];

    mockFetch.mockResolvedValueOnce(
      makePageResponse(page0, { total: 10, page: 0, pageCount: 5 }),
    );

    const existing = new Set(["old1", "old2"]);
    const result = await fetchAllWorkouts("user1", "token1", undefined, existing);

    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("filters out non-COMPLETE workouts", async () => {
    const workouts = [
      makePelotonWorkout("w1", { status: "COMPLETE" }),
      makePelotonWorkout("w2", { status: "IN_PROGRESS" }),
      makePelotonWorkout("w3", { status: "COMPLETE" }),
    ];

    mockFetch.mockResolvedValueOnce(
      makePageResponse(workouts, { total: 3, page: 0, pageCount: 1 }),
    );

    const result = await fetchAllWorkouts("user1", "token1");

    expect(result).toHaveLength(2);
    expect(result.map((w) => w.id)).toEqual(["w1", "w3"]);
  });

  it("calls onProgress with correct values", async () => {
    const page0 = [makePelotonWorkout("w1"), makePelotonWorkout("w2")];
    const page1 = [makePelotonWorkout("w3")];

    mockFetch.mockResolvedValueOnce(
      makePageResponse(page0, { total: 3, page: 0, pageCount: 2 }),
    );
    mockFetch.mockResolvedValueOnce(
      makePageResponse(page1, { total: 3, page: 1, pageCount: 2 }),
    );

    const onProgress = vi.fn();
    await fetchAllWorkouts("user1", "token1", onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 3); // after page 0: 2 fetched, 3 total
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3); // after page 1: 3 fetched, 3 total
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, "Unauthorized"));

    await expect(
      fetchAllWorkouts("user1", "token1"),
    ).rejects.toThrow("Fetch workouts failed (401): Unauthorized");
  });

  it("maps workout fields correctly", async () => {
    const workout = makePelotonWorkout("w1", {
      created_at: 1700000000,
      fitness_discipline: "cycling",
      total_work: 250000,
      workout_type: "class",
      effort_zones: {
        total_effort_points: 42.5,
        heart_rate_zone_durations: {},
      },
      ride: {
        title: "30 min Pop Ride",
        duration: 1800,
        is_live_in_studio_only: false,
        instructor: { name: "Cody Rigsby" },
        fitness_discipline: "cycling",
      },
    });

    mockFetch.mockResolvedValueOnce(
      makePageResponse([workout], { total: 1, page: 0, pageCount: 1 }),
    );

    const [result] = await fetchAllWorkouts("user1", "token1");

    expect(result.id).toBe("w1");
    expect(result.peloton_id).toBe("w1");
    expect(result.date).toBe(1700000000);
    expect(result.duration_seconds).toBe(1800);
    expect(result.discipline).toBe("cycling");
    expect(result.title).toBe("30 min Pop Ride");
    expect(result.instructor).toBe("Cody Rigsby");
    expect(result.strive_score).toBe(42.5);
    expect(result.is_live).toBe(1); // is_live_in_studio_only=false → 1
    expect(result.workout_type).toBe("class");
    expect(result.total_output).toBe(250000);
    expect(result.source).toBe("api");
    expect(result.raw_json).toBeTruthy();
  });

  it("uses duration fallback when no ride", async () => {
    const workout = makePelotonWorkout("w1", {
      start_time: 1000,
      end_time: 2800,
      ride: undefined,
    });

    mockFetch.mockResolvedValueOnce(
      makePageResponse([workout], { total: 1, page: 0, pageCount: 1 }),
    );

    const [result] = await fetchAllWorkouts("user1", "token1");

    expect(result.duration_seconds).toBe(1800); // end_time - start_time
    expect(result.title).toBe("Just Work Out");
    expect(result.instructor).toBeNull();
  });
});
