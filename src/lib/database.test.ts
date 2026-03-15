import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database instance
const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockDb = { execute: mockExecute, select: mockSelect };

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: () => Promise.resolve(mockDb),
  },
}));

// Import after mock is set up
import { getExistingWorkoutIds, insertWorkouts, queryWorkouts } from "./database";
import type { Workout } from "../types";

function makeWorkout(id: string, overrides: Partial<Workout> = {}): Workout {
  return {
    id,
    peloton_id: id,
    date: 1700000000,
    duration_seconds: 1800,
    discipline: "cycling",
    title: "30 min Ride",
    instructor: "Cody Rigsby",
    output_watts: 200,
    calories: 400,
    distance: 10,
    avg_heart_rate: 150,
    avg_cadence: 80,
    avg_resistance: 40,
    avg_speed: 20,
    strive_score: 42.5,
    is_live: 1,
    workout_type: "class",
    total_output: 250000,
    avg_incline: null,
    avg_pace: null,
    source: "api",
    raw_json: "{}",
    ...overrides,
  };
}

beforeEach(() => {
  mockExecute.mockReset();
  mockSelect.mockReset();
});

describe("getExistingWorkoutIds", () => {
  it("returns a Set of IDs from DB rows", async () => {
    mockSelect.mockResolvedValueOnce([
      { id: "w1" },
      { id: "w2" },
      { id: "w3" },
    ]);

    const result = await getExistingWorkoutIds();

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has("w1")).toBe(true);
    expect(result.has("w2")).toBe(true);
    expect(result.has("w3")).toBe(true);
    expect(mockSelect).toHaveBeenCalledWith("SELECT id FROM workouts");
  });

  it("returns empty set when no rows", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const result = await getExistingWorkoutIds();

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});

describe("insertWorkouts", () => {
  it("calls execute with correct SQL and params for each workout", async () => {
    mockExecute.mockResolvedValue(undefined);
    const w1 = makeWorkout("w1");
    const w2 = makeWorkout("w2", { instructor: null, strive_score: null });

    await insertWorkouts([w1, w2]);

    expect(mockExecute).toHaveBeenCalledTimes(2);

    // Verify first call has correct params
    const [sql1, params1] = mockExecute.mock.calls[0];
    expect(sql1).toContain("INSERT OR REPLACE INTO workouts");
    expect(params1[0]).toBe("w1"); // id
    expect(params1[1]).toBe("w1"); // peloton_id
    expect(params1[6]).toBe("Cody Rigsby"); // instructor

    // Verify second call
    const [, params2] = mockExecute.mock.calls[1];
    expect(params2[0]).toBe("w2");
    expect(params2[6]).toBeNull(); // instructor is null
    expect(params2[14]).toBeNull(); // strive_score is null
  });
});

describe("queryWorkouts", () => {
  it("queries with no filters, default sort", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts({});

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("SELECT * FROM workouts");
    expect(sql).toContain("ORDER BY date DESC");
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("builds WHERE clause for discipline filter", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts({ discipline: "cycling" });

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("WHERE discipline = $1");
    expect(params).toEqual(["cycling"]);
  });

  it("builds WHERE clause for multiple filters", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts({
      discipline: "cycling",
      instructor: "Cody Rigsby",
      minDuration: 1200,
      maxDuration: 3600,
    });

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("discipline = $1");
    expect(sql).toContain("instructor = $2");
    expect(sql).toContain("duration_seconds >= $3");
    expect(sql).toContain("duration_seconds <= $4");
    expect(params).toEqual(["cycling", "Cody Rigsby", 1200, 3600]);
  });

  it("applies sortBy and sortOrder", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts({ sortBy: "calories", sortOrder: "asc" });

    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("ORDER BY calories ASC");
  });

  it("falls back to date DESC for unsortable column", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts({ sortBy: "raw_json" as keyof Workout });

    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("ORDER BY date DESC");
  });
});
