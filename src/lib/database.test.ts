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
import { getExistingWorkoutIds, insertWorkouts, queryWorkouts, getDistinctValues } from "./database";
import type { Workout, WorkoutFilters, FilterCondition } from "../types";

function makeWorkout(id: string, overrides: Partial<Workout> = {}): Workout {
  return {
    id,
    peloton_id: id,
    date: 1700000000,
    duration_seconds: 1800,
    discipline: "cycling",
    title: "30 min Ride",
    instructor: "Cody Rigsby",
    avg_output: 200,
    calories: 400,
    distance: 10,
    avg_heart_rate: 150,
    avg_cadence: 80,
    avg_resistance: 40,
    avg_speed: 20,
    strive_score: 42.5,
    is_live: 1,
    workout_type: "class",
    total_work: 250000,
    source: "api",
    raw_json: "{}",
    raw_detail_json: null,
    raw_performance_graph_json: null,
    raw_ride_details_json: null,
    class_type: "Ride",
    class_subtype: null,
    class_type_version: 3,
    ...overrides,
  };
}

function makeFilters(
  conditions: FilterCondition[] = [],
  sort: WorkoutFilters["sort"] = { field: "date", direction: "desc" },
  search = "",
): WorkoutFilters {
  return { conditions, sort, search };
}

function makeCond(overrides: Partial<FilterCondition> = {}): FilterCondition {
  return {
    id: "test-id",
    field: "discipline",
    operator: "equals",
    value: "",
    values: [],
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
  it("queries with no conditions, default sort", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(makeFilters());

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("SELECT * FROM workouts");
    expect(sql).toContain("ORDER BY date DESC");
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("applies sort field and direction", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(makeFilters([], { field: "calories", direction: "asc" }));

    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("ORDER BY calories ASC");
  });

  it("falls back to date DESC for unsortable column", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(makeFilters([], { field: "raw_json", direction: "asc" }));

    const [sql] = mockSelect.mock.calls[0];
    // Field falls back to "date" but direction is preserved from input
    expect(sql).toContain("ORDER BY date ASC");
  });

  it("builds enum equals with values (IN clause)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "discipline", operator: "equals", values: ["cycling", "running"] }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("discipline IN ($1, $2)");
    expect(params).toEqual(["cycling", "running"]);
  });

  it("builds enum not_equals with values (NOT IN clause)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "discipline", operator: "not_equals", values: ["cycling"] }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("discipline NOT IN ($1)");
    expect(params).toEqual(["cycling"]);
  });

  it("builds string contains (LIKE %value%)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "contains", value: "Ride" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("title LIKE $1");
    expect(params).toEqual(["%Ride%"]);
  });

  it("builds string not_contains (NOT LIKE %value%)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "not_contains", value: "Ride" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("title NOT LIKE $1");
    expect(params).toEqual(["%Ride%"]);
  });

  it("builds string starts_with (LIKE value%)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "starts_with", value: "30" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("title LIKE $1");
    expect(params).toEqual(["30%"]);
  });

  it("builds string ends_with (LIKE %value)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "ends_with", value: "Ride" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("title LIKE $1");
    expect(params).toEqual(["%Ride"]);
  });

  it("builds numeric gt operator", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "gt", value: "300" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories > $1");
    expect(params).toEqual([300]);
  });

  it("builds numeric gte operator", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "gte", value: "300" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories >= $1");
    expect(params).toEqual([300]);
  });

  it("builds numeric lt operator", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "lt", value: "500" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories < $1");
    expect(params).toEqual([500]);
  });

  it("builds numeric lte operator", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "lte", value: "500" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories <= $1");
    expect(params).toEqual([500]);
  });

  it("builds is_empty (unary, no params)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "instructor", operator: "is_empty" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("(instructor IS NULL OR instructor = '')");
    expect(params).toEqual([]);
  });

  it("builds is_not_empty (unary, no params)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "instructor", operator: "is_not_empty" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("(instructor IS NOT NULL AND instructor != '')");
    expect(params).toEqual([]);
  });

  it("combines multiple conditions with AND", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ id: "c1", field: "discipline", operator: "equals", values: ["cycling"] }),
        makeCond({ id: "c2", field: "calories", operator: "gt", value: "200" }),
        makeCond({ id: "c3", field: "instructor", operator: "is_not_empty" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("WHERE");
    expect(sql).toContain("discipline IN ($1)");
    expect(sql).toContain("AND");
    expect(sql).toContain("calories > $2");
    expect(sql).toContain("(instructor IS NOT NULL AND instructor != '')");
    expect(params).toEqual(["cycling", 200]);
  });

  it("skips incomplete conditions (no value yet)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "contains", value: "" }),
        makeCond({ id: "c2", field: "discipline", operator: "equals", values: [] }),
        makeCond({ id: "c3", field: "calories", operator: "gt", value: "" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("skips incomplete conditions but keeps complete ones", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ id: "c1", field: "title", operator: "contains", value: "" }),
        makeCond({ id: "c2", field: "calories", operator: "gt", value: "300" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("WHERE calories > $1");
    expect(sql).not.toContain("title");
    expect(params).toEqual([300]);
  });

  it("skips invalid conditions (unknown field)", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "nonexistent_field", operator: "equals", value: "test" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("builds string equals with value", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "title", operator: "equals", value: "30 min Ride" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("title = $1");
    expect(params).toEqual(["30 min Ride"]);
  });

  it("builds numeric equals with value", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "equals", value: "400" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories = $1");
    expect(params).toEqual([400]);
  });

  it("builds numeric not_equals with value", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters([
        makeCond({ field: "calories", operator: "not_equals", value: "400" }),
      ]),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("calories != $1");
    expect(params).toEqual([400]);
  });

  it("applies full-text search across text columns", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(makeFilters([], undefined, "cool"));

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("WHERE");
    expect(sql).toContain("title LIKE $1");
    expect(sql).toContain("instructor LIKE $2");
    expect(sql).toContain("discipline LIKE $3");
    expect(sql).toContain("workout_type LIKE $4");
    expect(sql).toContain("class_type LIKE $5");
    expect(sql).toContain("class_subtype LIKE $6");
    expect(sql).toContain(" OR ");
    expect(params).toEqual(["%cool%", "%cool%", "%cool%", "%cool%", "%cool%", "%cool%"]);
  });

  it("combines search with filter conditions", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(
      makeFilters(
        [makeCond({ field: "discipline", operator: "equals", values: ["cycling"] })],
        undefined,
        "cool",
      ),
    );

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).toContain("discipline IN ($1)");
    expect(sql).toContain("AND");
    expect(sql).toContain("title LIKE $2");
    expect(params).toEqual(["cycling", "%cool%", "%cool%", "%cool%", "%cool%", "%cool%", "%cool%"]);
  });

  it("ignores empty search string", async () => {
    mockSelect.mockResolvedValueOnce([]);

    await queryWorkouts(makeFilters([], undefined, ""));

    const [sql, params] = mockSelect.mock.calls[0];
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });
});

describe("getDistinctValues", () => {
  it("returns sorted distinct values for an enum column", async () => {
    mockSelect.mockResolvedValueOnce([
      { discipline: "cycling" },
      { discipline: "running" },
      { discipline: "strength" },
    ]);

    const result = await getDistinctValues("discipline");

    expect(result).toEqual(["cycling", "running", "strength"]);
    const [sql] = mockSelect.mock.calls[0];
    expect(sql).toContain("SELECT DISTINCT discipline FROM workouts");
    expect(sql).toContain("ORDER BY discipline ASC");
  });

  it("rejects non-whitelisted columns", async () => {
    await expect(getDistinctValues("raw_json")).rejects.toThrow(
      'Column "raw_json" is not allowed for distinct values',
    );
  });

  it("rejects columns that are not enum type", async () => {
    await expect(getDistinctValues("title")).rejects.toThrow(
      'Column "title" is not allowed for distinct values',
    );
  });
});
