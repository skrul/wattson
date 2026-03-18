import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionStore } from "../stores/sessionStore";
import type { UserProfile } from "../types";

// --- Mocks ---

const mockFetchAllWorkouts = vi.fn();
const mockFetchUserProfile = vi.fn();
vi.mock("./api", () => ({
  fetchAllWorkouts: (...args: unknown[]) => mockFetchAllWorkouts(...args),
  fetchUserProfile: (...args: unknown[]) => mockFetchUserProfile(...args),
  AuthError: class AuthError extends Error {},
}));

const mockGetExistingWorkoutIds = vi.fn();
const mockInsertWorkouts = vi.fn();
const mockQueryWorkouts = vi.fn();
const mockUpsertUserProfile = vi.fn();
const mockUpdateWorkoutMetrics = vi.fn();
vi.mock("./database", () => ({
  getExistingWorkoutIds: (...args: unknown[]) => mockGetExistingWorkoutIds(...args),
  insertWorkouts: (...args: unknown[]) => mockInsertWorkouts(...args),
  queryWorkouts: (...args: unknown[]) => mockQueryWorkouts(...args),
  upsertUserProfile: (...args: unknown[]) => mockUpsertUserProfile(...args),
  updateWorkoutMetrics: (...args: unknown[]) => mockUpdateWorkoutMetrics(...args),
  getEnrichmentCounts: vi.fn().mockResolvedValue({ total: 0, enriched: 0 }),
  getUnenrichedWorkouts: vi.fn().mockResolvedValue([]),
}));

vi.mock("./enrichmentCache", () => ({
  cachedFetchPerformanceGraph: vi.fn().mockResolvedValue({ rawJson: "{}" }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Import after mocks
import { syncWorkouts } from "./sync";

// --- Helpers ---

function setSession() {
  useSessionStore.setState({
    session: { userId: "u1", accessToken: "tok", email: "a@b.com", password: "pw" },
    loaded: true,
  });
}

function setUserProfile(totalWorkouts: number) {
  useSessionStore.setState({
    userProfile: {
      user_id: "u1",
      total_workouts: totalWorkouts,
      raw_json: "{}",
    } as UserProfile,
  });
}

beforeEach(() => {
  mockFetchAllWorkouts.mockReset();
  mockFetchUserProfile.mockReset();
  mockGetExistingWorkoutIds.mockReset();
  mockInsertWorkouts.mockReset();
  mockQueryWorkouts.mockReset();
  mockUpsertUserProfile.mockReset();
  mockUpdateWorkoutMetrics.mockReset();

  // Reset stores
  useSessionStore.setState({
    session: null,
    loaded: false,
    userProfile: null,
    isSyncing: false,
  });

  // Default mock implementations
  mockFetchAllWorkouts.mockResolvedValue([]);
  mockFetchUserProfile.mockResolvedValue({ user_id: "u1", total_workouts: 10, raw_json: "{}" });
  mockUpsertUserProfile.mockResolvedValue(undefined);
  mockQueryWorkouts.mockResolvedValue([]);
  mockInsertWorkouts.mockResolvedValue(undefined);
});

describe("syncWorkouts", () => {
  it("passes existingIds to fetchAllWorkouts when profile has total_workouts and DB count matches", async () => {
    setSession();
    setUserProfile(3);

    const existingIds = new Set(["w1", "w2", "w3"]);
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    await syncWorkouts();

    // fetchAllWorkouts should receive existingIds as 4th arg (early-stop enabled)
    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBe(existingIds); // existingIds passed → early-stop enabled
    expect(args[4]).toBe(3); // totalWorkouts
  });

  it("does NOT pass existingIds when userProfile is null (no early-stop)", async () => {
    setSession();
    // No userProfile set — simulates the race condition bug

    const existingIds = new Set(["w1", "w2", "w3"]);
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    await syncWorkouts();

    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBeUndefined(); // no existingIds → no early-stop
    expect(args[4]).toBeUndefined(); // no totalWorkouts
  });

  it("does NOT pass existingIds when DB has fewer workouts than profile total (incomplete sync)", async () => {
    setSession();
    setUserProfile(100); // profile says 100 workouts

    const existingIds = new Set(["w1", "w2"]); // but only 2 in DB
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    await syncWorkouts();

    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBeUndefined(); // no early-stop for incomplete sync
    expect(args[4]).toBe(100);
  });

  it("sets isSyncing true at start and false when no new workouts", async () => {
    setSession();
    setUserProfile(2);
    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1", "w2"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" }, { id: "w2" },
    ]);

    expect(useSessionStore.getState().isSyncing).toBe(false);
    await syncWorkouts();
    expect(useSessionStore.getState().isSyncing).toBe(false);
  });

  it("sets isSyncing false after inserting new workouts (before enrichment)", async () => {
    setSession();
    setUserProfile(2);
    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" }, { id: "w2" },
    ]);

    // Track when isSyncing becomes false relative to insertWorkouts
    let syncingWhenInsertCalled: boolean | undefined;
    mockInsertWorkouts.mockImplementation(() => {
      syncingWhenInsertCalled = useSessionStore.getState().isSyncing;
      return Promise.resolve();
    });

    await syncWorkouts();

    expect(syncingWhenInsertCalled).toBe(true); // still syncing during insert
    expect(useSessionStore.getState().isSyncing).toBe(false); // false after
  });

  it("throws when not logged in", async () => {
    // No session set
    useSessionStore.setState({ session: null, loaded: true });
    await expect(syncWorkouts()).rejects.toThrow("Not logged in");
  });
});
