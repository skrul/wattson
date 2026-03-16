import { create } from "zustand";
import { getSetting, setSetting, getUnenrichedWorkoutIds, getEnrichmentCounts, updateWorkoutMetrics } from "../lib/database";
import { cachedFetchPerformanceGraph } from "../lib/enrichmentCache";
import { useSessionStore } from "./sessionStore";

type EnrichmentMode = "summary" | "detailed";
type BackfillStatus = "idle" | "running" | "paused" | "complete";

interface EnrichmentState {
  mode: EnrichmentMode;
  backfillStatus: BackfillStatus;
  enrichedCount: number;
  totalCount: number;
  enrichmentComplete: boolean;

  loadState: () => Promise<void>;
  enableDetailedMode: () => Promise<void>;
  disableDetailedMode: () => Promise<void>;
  startBackfill: () => void;
  pauseBackfill: () => void;
  refreshCounts: () => Promise<void>;
}

// Module-level abort flag for clean cancellation
let abortBackfill = false;

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

    const ids = await getUnenrichedWorkoutIds();
    if (ids.length === 0) {
      await useEnrichmentStore.getState().refreshCounts();
      useEnrichmentStore.setState({ backfillStatus: "complete", enrichmentComplete: true });
      return;
    }

    const workoutId = ids[0];
    try {
      const result = await cachedFetchPerformanceGraph(workoutId, session.accessToken);
      await updateWorkoutMetrics(workoutId, result, null, result.rawJson);
      await useEnrichmentStore.getState().refreshCounts();
    } catch (e) {
      console.error(`Enrichment failed for workout ${workoutId}:`, e);
      // On auth error, pause the backfill so user can re-authenticate
      if (e instanceof Error && e.name === "AuthError") {
        useEnrichmentStore.setState({ backfillStatus: "paused" });
        return;
      }
      // For other errors, continue to next workout
    }

    if (abortBackfill) break;

    // Rate limit: 2 seconds between requests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (abortBackfill) {
    useEnrichmentStore.setState({ backfillStatus: "paused" });
  }
}

export const useEnrichmentStore = create<EnrichmentState>((set, get) => ({
  mode: "summary",
  backfillStatus: "idle",
  enrichedCount: 0,
  totalCount: 0,
  enrichmentComplete: false,

  loadState: async () => {
    const mode = ((await getSetting("enrichment_mode")) ?? "summary") as EnrichmentMode;
    const counts = await getEnrichmentCounts();
    const complete = counts.total > 0 && counts.enriched >= counts.total;
    set({
      mode,
      enrichedCount: counts.enriched,
      totalCount: counts.total,
      enrichmentComplete: complete,
      backfillStatus: mode === "detailed" && !complete ? "paused" : mode === "detailed" ? "complete" : "idle",
    });
  },

  enableDetailedMode: async () => {
    await setSetting("enrichment_mode", "detailed");
    set({ mode: "detailed" });
    runBackfillLoop();
  },

  disableDetailedMode: async () => {
    abortBackfill = true;
    await setSetting("enrichment_mode", "summary");
    set({ mode: "summary", backfillStatus: "idle", enrichmentComplete: false });
  },

  startBackfill: () => {
    if (get().mode !== "detailed") return;
    runBackfillLoop();
  },

  pauseBackfill: () => {
    abortBackfill = true;
  },

  refreshCounts: async () => {
    const counts = await getEnrichmentCounts();
    const complete = counts.total > 0 && counts.enriched >= counts.total;
    set({
      enrichedCount: counts.enriched,
      totalCount: counts.total,
      enrichmentComplete: complete,
    });
  },
}));
