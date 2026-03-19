import { create } from "zustand";
import { getUnenrichedWorkouts, getEnrichmentCounts, updateWorkoutMetrics, updateRideDetails } from "../lib/database";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "../lib/enrichmentCache";
import { useSessionStore } from "./sessionStore";
import { useWorkoutStore } from "./workoutStore";

type BackfillStatus = "running" | "paused" | "complete";

interface EnrichmentState {
  countsLoaded: boolean;
  backfillStatus: BackfillStatus;
  enrichedCount: number;
  totalCount: number;
  enrichmentComplete: boolean;

  loadState: () => Promise<void>;
  startBackfill: () => void;
  pauseBackfill: () => void;
  ensureRunning: () => void;
  refreshCounts: () => Promise<void>;
  reset: () => void;
}

// Module-level abort flag for clean cancellation
let abortBackfill = false;

// Workout IDs that failed during this session — skipped until next app launch
const skippedIds = new Set<string>();

async function runBackfillLoop() {
  const store = useEnrichmentStore.getState();
  if (store.backfillStatus === "running") return; // already running

  useEnrichmentStore.setState({ backfillStatus: "running" });
  abortBackfill = false;

  while (!abortBackfill) {
    const session = useSessionStore.getState().session;
    if (!session) {
      useEnrichmentStore.setState({ backfillStatus: "paused" });
      return;
    }

    const unenriched = await getUnenrichedWorkouts();
    const next = unenriched.find((w) => !skippedIds.has(w.id));
    if (!next) {
      await useEnrichmentStore.getState().refreshCounts();
      useEnrichmentStore.setState({ backfillStatus: "complete", enrichmentComplete: true });
      // Bump syncGeneration so dashboard widgets refetch with enriched data
      useWorkoutStore.setState((s) => ({ syncGeneration: s.syncGeneration + 1 }));
      return;
    }

    const { id: workoutId, ride_id: rawRideId } = next;
    const rideId = rawRideId && rawRideId !== "00000000000000000000000000000000" ? rawRideId : null;
    let allCacheHits = false;
    try {
      const [perfResult, detailResult, rideResult] = await Promise.all([
        cachedFetchPerformanceGraph(workoutId, session.accessToken),
        cachedFetchWorkoutDetail(workoutId, session.accessToken).catch(() => null),
        rideId ? cachedFetchRideDetails(rideId, session.accessToken).catch(() => null) : Promise.resolve(null),
      ]);
      allCacheHits = perfResult.cacheHit
        && (detailResult?.cacheHit ?? false)
        && (rideResult?.cacheHit ?? !rideId);

      const detailOk = detailResult != null;
      const rideOk = rideResult != null || !rideId;

      await updateWorkoutMetrics(workoutId, perfResult, detailResult?.rawJson ?? null, perfResult.rawJson);
      if (rideOk) {
        await updateRideDetails(workoutId, rideResult?.rawJson ?? null);
      }

      // If detail or ride failed, skip this workout for the rest of the session
      // so the loop advances. It will be retried on next app launch.
      if (!detailOk || !rideOk) {
        skippedIds.add(workoutId);
      }

      await useEnrichmentStore.getState().refreshCounts();
    } catch (e) {
      console.error(`Enrichment failed for workout ${workoutId}:`, e);
      // On auth error, pause the backfill so user can re-authenticate
      if (e instanceof Error && e.name === "AuthError") {
        useEnrichmentStore.setState({ backfillStatus: "paused" });
        return;
      }
      // For other errors, skip this workout and continue
      skippedIds.add(workoutId);
    }

    if (abortBackfill) break;

    // Only rate limit when we actually hit the API
    if (!allCacheHits) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (abortBackfill) {
    useEnrichmentStore.setState({ backfillStatus: "paused" });
  }
}

export const useEnrichmentStore = create<EnrichmentState>((set, get) => ({
  countsLoaded: false,
  backfillStatus: "paused",
  enrichedCount: 0,
  totalCount: 0,
  enrichmentComplete: false,

  loadState: async () => {
    const counts = await getEnrichmentCounts();
    const complete = counts.total > 0 && counts.enriched >= counts.total;
    set({
      countsLoaded: true,
      enrichedCount: counts.enriched,
      totalCount: counts.total,
      enrichmentComplete: complete,
      backfillStatus: complete ? "complete" : "paused",
    });
  },

  startBackfill: () => {
    runBackfillLoop();
  },

  pauseBackfill: () => {
    abortBackfill = true;
  },

  reset: () => {
    abortBackfill = true;
    skippedIds.clear();
    set({
      countsLoaded: false,
      backfillStatus: "paused",
      enrichedCount: 0,
      totalCount: 0,
      enrichmentComplete: false,
    });
  },

  ensureRunning: () => {
    const { backfillStatus } = get();
    if (backfillStatus !== "running" && backfillStatus !== "complete") {
      runBackfillLoop();
    }
  },

  refreshCounts: async () => {
    const counts = await getEnrichmentCounts();
    const complete = counts.total > 0 && counts.enriched >= counts.total;
    const update: Partial<EnrichmentState> = {
      countsLoaded: true,
      enrichedCount: counts.enriched,
      totalCount: counts.total,
      enrichmentComplete: complete,
    };
    // If status says "complete" but counts show unenriched workouts
    // (e.g., new workouts inserted after backfill finished), reset to "paused"
    // so ensureRunning() will pick them up.
    if (!complete && get().backfillStatus === "complete") {
      update.backfillStatus = "paused";
    }
    set(update);
  },
}));
