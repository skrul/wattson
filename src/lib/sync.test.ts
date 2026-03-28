import { describe, it, expect, vi, beforeEach } from "vitest";
import { createActor, fromCallback } from "xstate";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkoutStore } from "../stores/workoutStore";
import { syncMachine, type SyncEvent } from "../machines/syncMachine.config";

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

// Mock enrichment actor
const mockEnrichmentSend = vi.fn();
let mockEnrichmentValue: string = "paused";
vi.mock("../machines/enrichmentMachine", () => ({
  enrichmentActor: {
    send: (...args: unknown[]) => {
      mockEnrichmentSend(...args);
      const event = args[0] as { type: string; enriched?: number; total?: number };
      if (event.type === "REFRESH_COUNTS" && mockEnrichmentValue === "complete") {
        if (event.total! > 0 && event.enriched! < event.total!) {
          mockEnrichmentValue = "paused";
        }
      } else if (event.type === "START" && mockEnrichmentValue === "paused") {
        mockEnrichmentValue = "running";
      }
    },
    getSnapshot: () => ({ value: mockEnrichmentValue }),
  },
}));

// Mock auth actor
let mockAuthContext = {
  session: null as { userId: string; accessToken: string; email: string; password: string } | null,
};
const mockRefreshAuth = vi.fn();
vi.mock("../machines/authMachine", () => ({
  authActor: {
    getSnapshot: () => ({ context: mockAuthContext }),
    send: vi.fn(),
  },
  refreshAuth: (...args: unknown[]) => mockRefreshAuth(...args),
}));

// Import after mocks
import { fetchAllWorkouts, fetchUserProfile, AuthError } from "./api";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "./enrichmentCache";
import { getExistingWorkoutIds, insertWorkouts, queryWorkouts, upsertUserProfile, updateWorkoutMetrics, updateRideDetails, getEnrichmentCounts } from "./database";
import { authActor, refreshAuth } from "../machines/authMachine";
import { enrichmentActor } from "../machines/enrichmentMachine";

// --- Helpers ---

function setSession() {
  mockAuthContext.session = { userId: "u1", accessToken: "tok", email: "a@b.com", password: "pw" };
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

/** Create a real sync machine with the syncWorker from syncMachine.ts logic */
function createTestSyncMachine() {
  return syncMachine.provide({
    actors: {
      syncWorker: fromCallback<SyncEvent>(({ sendBack }) => {
        let aborted = false;

        (async () => {
          const session = authActor.getSnapshot().context.session;
          if (!session) throw new Error("Not logged in");

          const cachedProfile = useSessionStore.getState().userProfile;
          const totalWorkouts = cachedProfile?.total_workouts ?? undefined;

          const existingIds = await getExistingWorkoutIds();

          const isComplete =
            totalWorkouts != null && existingIds.size >= totalWorkouts;

          const reportProgress = (fetched: number, total: number) => {
            if (!aborted) sendBack({ type: "PROGRESS", fetched, total });
          };

          const doFetch = async (userId: string, accessToken: string) => {
            return fetchAllWorkouts(
              userId,
              accessToken,
              reportProgress,
              isComplete ? existingIds : undefined,
              totalWorkouts,
            );
          };

          const fetchAndCacheProfile = async (token: string) => {
            try {
              const profile = await fetchUserProfile(token);
              await upsertUserProfile(profile);
              useSessionStore.getState().setUserProfile(profile);
            } catch {
              // Non-fatal
            }
          };

          let workouts;
          let activeToken = session.accessToken;
          const profilePromise = fetchAndCacheProfile(activeToken);
          try {
            workouts = await doFetch(session.userId, activeToken);
          } catch (e: any) {
            if (!(e instanceof AuthError)) throw e;
            try {
              activeToken = await refreshAuth();
            } catch {
              if (!aborted) sendBack({ type: "AUTH_ERROR" });
              return;
            }
            workouts = await doFetch(session.userId, activeToken);
          }

          if (activeToken !== session.accessToken) {
            fetchAndCacheProfile(activeToken);
          }
          await profilePromise;

          const newWorkouts = workouts.filter((w: any) => !existingIds.has(w.id));

          if (newWorkouts.length > 0) {
            await insertWorkouts(newWorkouts);

            const counts = await getEnrichmentCounts();
            enrichmentActor.send({
              type: "REFRESH_COUNTS",
              enriched: counts.enriched,
              total: counts.total,
            });

            const filters = useWorkoutStore.getState().filters;
            const updated = await queryWorkouts(filters);
            useWorkoutStore.getState().setWorkouts(updated);
            useWorkoutStore.getState().notifySync();

            if (isComplete) {
              for (const w of newWorkouts) {
                if (aborted) break;
                try {
                  const rideId =
                    w.ride_id && w.ride_id !== "00000000000000000000000000000000"
                      ? w.ride_id
                      : null;

                  const [perfResult, detailResult, rideResult] = await Promise.all([
                    cachedFetchPerformanceGraph(w.id, activeToken),
                    cachedFetchWorkoutDetail(w.id, activeToken).catch(() => null),
                    rideId
                      ? cachedFetchRideDetails(rideId, activeToken).catch(() => null)
                      : Promise.resolve(null),
                  ]);

                  await updateWorkoutMetrics(
                    w.id,
                    perfResult,
                    detailResult?.rawJson ?? null,
                    perfResult.rawJson,
                  );
                  await updateRideDetails(
                    w.id,
                    rideResult?.rawJson ?? null,
                    w.title,
                  );
                } catch {
                  // Non-fatal
                }
              }
              const refreshedCounts = await getEnrichmentCounts();
              enrichmentActor.send({
                type: "REFRESH_COUNTS",
                enriched: refreshedCounts.enriched,
                total: refreshedCounts.total,
              });
              useWorkoutStore.getState().notifySync();
            }
          }

          const snap = enrichmentActor.getSnapshot();
          if (snap.value === "paused") {
            enrichmentActor.send({ type: "START" });
          }

          if (!aborted) {
            sendBack({ type: "COMPLETE", newCount: newWorkouts.length });
          }
        })().catch((err) => {
          if (!aborted) {
            sendBack({
              type: "SYNC_ERROR",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        });

        return () => {
          aborted = true;
        };
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(cachedFetchPerformanceGraph).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(cachedFetchWorkoutDetail).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(cachedFetchRideDetails).mockResolvedValue({ rawJson: "{}", cacheHit: false } as any);
  vi.mocked(updateRideDetails).mockResolvedValue(undefined);

  useSessionStore.setState({ userProfile: null });
  useWorkoutStore.setState({ syncGeneration: 0 });

  mockAuthContext = { session: null };
  mockEnrichmentValue = "paused";

  mockFetchAllWorkouts.mockResolvedValue([]);
  mockFetchUserProfile.mockResolvedValue({ user_id: "u1", total_workouts: 10, raw_json: "{}" });
  mockUpsertUserProfile.mockResolvedValue(undefined);
  mockQueryWorkouts.mockResolvedValue([]);
  mockInsertWorkouts.mockResolvedValue(undefined);
  mockUpdateWorkoutMetrics.mockResolvedValue(undefined);
});

// --- Pure machine transition tests ---

describe("syncMachine transitions", () => {
  it("starts in idle state", () => {
    const actor = createActor(syncMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  it("transitions idle → syncing on SYNC", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    expect(actor.getSnapshot().value).toBe("syncing");
    actor.stop();
  });

  it("ignores SYNC when already syncing (concurrent sync prevention)", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    expect(actor.getSnapshot().value).toBe("syncing");
    // Second SYNC should be ignored since syncing state doesn't handle SYNC
    actor.send({ type: "SYNC" });
    expect(actor.getSnapshot().value).toBe("syncing");
    actor.stop();
  });

  it("updates progress in syncing state", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "PROGRESS", fetched: 5, total: 10 });
    expect(actor.getSnapshot().context.progress).toEqual({ fetched: 5, total: 10 });
    actor.stop();
  });

  it("transitions syncing → done on COMPLETE", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "COMPLETE", newCount: 42 });
    expect(actor.getSnapshot().value).toBe("done");
    expect(actor.getSnapshot().context.newCount).toBe(42);
    actor.stop();
  });

  it("transitions syncing → error on AUTH_ERROR", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "AUTH_ERROR" });
    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.error).toBe("Authentication failed");
    actor.stop();
  });

  it("allows retry from error state", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "AUTH_ERROR" });
    expect(actor.getSnapshot().value).toBe("error");
    actor.send({ type: "SYNC" });
    expect(actor.getSnapshot().value).toBe("syncing");
    // Error should be cleared
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });

  it("allows re-sync from done state", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "COMPLETE", newCount: 5 });
    expect(actor.getSnapshot().value).toBe("done");
    actor.send({ type: "SYNC" });
    expect(actor.getSnapshot().value).toBe("syncing");
    actor.stop();
  });

  it("RESET returns to idle and clears context from any state", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "COMPLETE", newCount: 5 });
    expect(actor.getSnapshot().value).toBe("done");
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context).toEqual({
      progress: null,
      newCount: 0,
      error: null,
    });
    actor.stop();
  });

  it("RESET works from error state", () => {
    const actor = createActor(syncMachine).start();
    actor.send({ type: "SYNC" });
    actor.send({ type: "AUTH_ERROR" });
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.error).toBeNull();
    actor.stop();
  });
});

// --- Actor integration tests ---

describe("syncWorker actor integration", () => {
  it("passes existingIds to fetchAllWorkouts when profile has total_workouts and DB count matches", async () => {
    setSession();
    setUserProfile(3);

    const existingIds = new Set(["w1", "w2", "w3"]);
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    // Wait for actor to reach done state
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBe(existingIds);
    expect(args[4]).toBe(3);
    actor.stop();
  });

  it("does NOT pass existingIds when userProfile is null (no early-stop)", async () => {
    setSession();

    const existingIds = new Set(["w1", "w2", "w3"]);
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBeUndefined();
    expect(args[4]).toBeUndefined();
    actor.stop();
  });

  it("does NOT pass existingIds when DB has fewer workouts than profile total", async () => {
    setSession();
    setUserProfile(100);

    const existingIds = new Set(["w1", "w2"]);
    mockGetExistingWorkoutIds.mockResolvedValue(existingIds);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(mockFetchAllWorkouts).toHaveBeenCalledTimes(1);
    const args = mockFetchAllWorkouts.mock.calls[0];
    expect(args[3]).toBeUndefined();
    expect(args[4]).toBe(100);
    actor.stop();
  });

  it("reaches done state with newCount=0 when no new workouts", async () => {
    setSession();
    setUserProfile(2);
    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1", "w2"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" }, { id: "w2" },
    ]);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(actor.getSnapshot().context.newCount).toBe(0);
    actor.stop();
  });

  it("reaches error state when not logged in", async () => {
    mockAuthContext.session = null;

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("error");
    });

    expect(actor.getSnapshot().context.error).toBe("Not logged in");
    actor.stop();
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

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

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
    actor.stop();
  });

  it("skips inline enrichment on full sync (isComplete=false)", async () => {
    setSession();
    setUserProfile(100);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2", ride_id: "ride456", title: "Cycling" },
    ]);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(cachedFetchPerformanceGraph).not.toHaveBeenCalled();
    expect(cachedFetchWorkoutDetail).not.toHaveBeenCalled();
    expect(cachedFetchRideDetails).not.toHaveBeenCalled();
    actor.stop();
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

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();

    const before = useWorkoutStore.getState().syncGeneration;
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    const after = useWorkoutStore.getState().syncGeneration;
    expect(after - before).toBe(2);
    actor.stop();
  });

  it("bumps syncGeneration once on full sync with new workouts", async () => {
    setSession();
    setUserProfile(100);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set(["w1"]));
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1" },
      { id: "w2", ride_id: "ride456", title: "Cycling" },
    ]);

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();

    const before = useWorkoutStore.getState().syncGeneration;
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    const after = useWorkoutStore.getState().syncGeneration;
    expect(after - before).toBe(1);
    actor.stop();
  });

  it("resets enrichment from complete to paused when new workouts are inserted", async () => {
    setSession();
    setUserProfile(100);

    mockGetExistingWorkoutIds.mockResolvedValue(new Set());
    mockFetchAllWorkouts.mockResolvedValue([
      { id: "w1", ride_id: null, title: "Ride 1" },
      { id: "w2", ride_id: null, title: "Ride 2" },
    ]);

    mockEnrichmentValue = "complete";
    vi.mocked(getEnrichmentCounts).mockResolvedValue({ total: 2, enriched: 0 });

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(mockEnrichmentSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REFRESH_COUNTS", enriched: 0, total: 2 }),
    );
    expect(mockEnrichmentSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START" }),
    );
    expect(mockEnrichmentValue).toBe("running");
    actor.stop();
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

    const machine = createTestSyncMachine();
    const actor = createActor(machine).start();
    actor.send({ type: "SYNC" });

    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe("done");
    });

    expect(cachedFetchPerformanceGraph).toHaveBeenCalledWith("w3", "tok");
    expect(cachedFetchWorkoutDetail).toHaveBeenCalledWith("w3", "tok");
    expect(cachedFetchRideDetails).not.toHaveBeenCalled();
    actor.stop();
  });
});
