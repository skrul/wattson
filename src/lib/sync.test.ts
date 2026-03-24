import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkoutStore } from "../stores/workoutStore";

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
  updateRideDetails: vi.fn().mockResolvedValue(undefined),
  getEnrichmentCounts: vi.fn().mockResolvedValue({ total: 0, enriched: 0 }),
  getUnenrichedWorkouts: vi.fn().mockResolvedValue([]),
}));

vi.mock("./enrichmentCache", () => ({
  cachedFetchPerformanceGraph: vi.fn().mockResolvedValue({ rawJson: "{}" }),
  cachedFetchWorkoutDetail: vi.fn().mockResolvedValue({ rawJson: "{}" }),
  cachedFetchRideDetails: vi.fn().mockResolvedValue({ rawJson: "{}" }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Import after mocks — these resolve to the vi.fn() instances from the factories above
import { syncWorkouts } from "./sync";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "./enrichmentCache";
import { updateRideDetails, getEnrichmentCounts } from "./database";
import { useEnrichmentStore } from "../stores/enrichmentStore";

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
    } as any,
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default resolved values for mocks that need them
  vi.mocked(cachedFetchPerformanceGraph).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(cachedFetchWorkoutDetail).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(cachedFetchRideDetails).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(updateRideDetails).mockResolvedValue(undefined);

  // Reset stores
  useSessionStore.setState({
    session: null,
    loaded: false,
    userProfile: null,
    isSyncing: false,
  });
  useWorkoutStore.setState({ syncGeneration: 0 });
  useEnrichmentStore.setState({
    countsLoaded: false,
    backfillStatus: "paused",
    enrichedCount: 0,
    totalCount: 0,
    enrichmentComplete: false,
  });

  // Default mock implementations
  mockFetchAllWorkouts.mockResolvedValue([]);
  mockFetchUserProfile.mockResolvedValue({ user_id: "u1", total_workouts: 10, raw_json: "{}" });
  mockUpsertUserProfile.mockResolvedValue(undefined);
  mockQueryWorkouts.mockResolvedValue([]);
  mockInsertWorkouts.mockResolvedValue(undefined);
  mockUpdateWorkoutMetrics.mockResolvedValue(undefined);
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

  it("runs inline enrichment on incremental sync (isComplete=true)", async () => {
    setSession();
    setUserProfile(2);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1", "w2"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2" },
      { id: "w3", ride_id: "ride123", title: "Cycling" },
    ]);

    await syncWorkouts();

    expect(cachedFetchPerformanceGraph).toHaveBeenCalledWith("w3", "tok");
    expect(cachedFetchWorkoutDetail).toHaveBeenCalledWith("w3", "tok");
    expect(cachedFetchRideDetails).toHaveBeenCalledWith("ride123", "tok");
    expect(mockUpdateWorkoutMetrics).toHaveBeenCalledWith(
      "w3",
      expect.objectContaining({ rawJson: "{}" }),
      "{}",
      "{}",
    );
    expect(updateRideDetails).toHaveBeenCalledWith("w3", "{}", "Cycling");
  });

  it("skips inline enrichment on full sync (isComplete=false)", async () => {
    setSession();
    setUserProfile(100); // profile says 100 workouts

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1"])); // only 1 in DB → incomplete
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2", ride_id: "ride456", title: "Cycling" },
    ]);

    await syncWorkouts();

    expect(cachedFetchPerformanceGraph).not.toHaveBeenCalled();
    expect(cachedFetchWorkoutDetail).not.toHaveBeenCalled();
    expect(cachedFetchRideDetails).not.toHaveBeenCalled();
  });

  it("bumps syncGeneration twice on incremental sync with new workouts", async () => {
    setSession();
    setUserProfile(2);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1", "w2"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2" },
      { id: "w3", ride_id: "ride123", title: "Cycling" },
    ]);

    const before = useWorkoutStore.getState().syncGeneration;
    await syncWorkouts();
    const after = useWorkoutStore.getState().syncGeneration;

    expect(after - before).toBe(2);
  });

  it("bumps syncGeneration once on full sync with new workouts", async () => {
    setSession();
    setUserProfile(100);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2", ride_id: "ride456", title: "Cycling" },
    ]);

    const before = useWorkoutStore.getState().syncGeneration;
    await syncWorkouts();
    const after = useWorkoutStore.getState().syncGeneration;

    expect(after - before).toBe(1);
  });

  it("resets enrichment from complete to paused when new workouts are inserted (fresh DB race)", async () => {
    setSession();
    setUserProfile(100); // full sync (isComplete=false)

    mockGetExistingWorkoutIds.mockResolvedValue(new Set());
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1", ride_id: null, title: "Ride 1" },
      { id: "w2", ride_id: null, title: "Ride 2" },
    ]);

    // Simulate the race: backfill loop already ran on empty DB and set "complete"
    useEnrichmentStore.setState({ backfillStatus: "complete", totalCount: 0 });

    // After insert, getEnrichmentCounts should reflect the new workouts
    vi.mocked(getEnrichmentCounts).mockResolvedValue({ total: 2, enriched: 0 });

    await syncWorkouts();

    // refreshCounts should have reset from "complete" to "paused"
    // and ensureRunning should have started the backfill
    const state = useEnrichmentStore.getState();
    expect(state.totalCount).toBe(2);
    expect(state.backfillStatus).toBe("running");
  });

  it("skips ride details fetch when ride_id is null UUID", async () => {
    setSession();
    setUserProfile(2);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1", "w2"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2" },
      { id: "w3", ride_id: "00000000000000000000000000000000", title: "Meditation" },
    ]);

    await syncWorkouts();

    // Performance graph and detail are still fetched
    expect(cachedFetchPerformanceGraph).toHaveBeenCalledWith("w3", "tok");
    expect(cachedFetchWorkoutDetail).toHaveBeenCalledWith("w3", "tok");
    // But ride details is NOT fetched for the null UUID
    expect(cachedFetchRideDetails).not.toHaveBeenCalled();
  });
});
