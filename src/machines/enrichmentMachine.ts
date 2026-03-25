import { setup, assign, createActor, fromPromise, fromCallback, type SnapshotFrom } from "xstate";
import { useSelector } from "@xstate/react";
import { getUnenrichedWorkouts, getEnrichmentCounts, updateWorkoutMetrics, updateRideDetails } from "../lib/database";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "../lib/enrichmentCache";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkoutStore } from "../stores/workoutStore";

const ENRICHMENT_DELAY_MS = parseInt(import.meta.env.VITE_ENRICHMENT_DELAY_MS || "2000", 10);
const RECONCILE_INTERVAL = 25;

// --- Actor logic ---

const loadCounts = fromPromise(async () => {
  return getEnrichmentCounts();
});

const backfillLoop = fromCallback<
  { type: "PAUSE" },
  { skippedIds: string[] }
>(({ sendBack, receive, input }) => {
  let aborted = false;

  receive((event) => {
    if (event.type === "PAUSE") {
      aborted = true;
    }
  });

  (async () => {
    let sinceLastReconcile = 0;
    const skippedIds = new Set(input.skippedIds);

    while (!aborted) {
      const session = useSessionStore.getState().session;
      if (!session) {
        sendBack({ type: "AUTH_ERROR" });
        return;
      }

      const unenriched = await getUnenrichedWorkouts();
      const next = unenriched.find((w) => !skippedIds.has(w.id));
      if (!next) {
        sendBack({ type: "ALL_DONE" });
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
          await updateRideDetails(workoutId, rideResult?.rawJson ?? null, next.title);
        }

        if (!detailOk || !rideOk) {
          skippedIds.add(workoutId);
          sendBack({ type: "WORKOUT_SKIPPED", workoutId });
        } else {
          sendBack({ type: "WORKOUT_ENRICHED" });
        }

        sinceLastReconcile++;
        if (sinceLastReconcile >= RECONCILE_INTERVAL) {
          const counts = await getEnrichmentCounts();
          sendBack({ type: "REFRESH_COUNTS", enriched: counts.enriched, total: counts.total });
          sinceLastReconcile = 0;
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AuthError") {
          sendBack({ type: "AUTH_ERROR" });
          return;
        }
        skippedIds.add(workoutId);
        sendBack({ type: "WORKOUT_SKIPPED", workoutId });
      }

      if (aborted) break;

      if (!allCacheHits) {
        await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_DELAY_MS));
      }
    }
  })();

  return () => {
    aborted = true;
  };
});

// --- Machine ---

type EnrichmentEvent =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESET" }
  | { type: "REFRESH_COUNTS"; enriched: number; total: number }
  | { type: "WORKOUT_ENRICHED" }
  | { type: "WORKOUT_SKIPPED"; workoutId: string }
  | { type: "ALL_DONE" }
  | { type: "AUTH_ERROR" };

interface EnrichmentContext {
  enrichedCount: number;
  totalCount: number;
  countsLoaded: boolean;
  skippedIds: string[];
  sinceLastReconcile: number;
}

export const enrichmentMachine = setup({
  types: {
    context: {} as EnrichmentContext,
    events: {} as EnrichmentEvent,
  },
  actors: {
    loadCounts,
    backfillLoop,
  },
  actions: {
    bumpSyncGeneration: () => {
      useWorkoutStore.setState((s) => ({ syncGeneration: s.syncGeneration + 1 }));
    },
  },
}).createMachine({
  id: "enrichment",
  initial: "loadingCounts",
  context: {
    enrichedCount: 0,
    totalCount: 0,
    countsLoaded: false,
    skippedIds: [],
    sinceLastReconcile: 0,
  },
  on: {
    RESET: {
      target: ".loadingCounts",
      actions: assign({
        enrichedCount: 0,
        totalCount: 0,
        countsLoaded: false,
        skippedIds: [],
        sinceLastReconcile: 0,
      }),
    },
    // Default handler for states that don't override (paused, loadingCounts).
    // running and complete override this with their own REFRESH_COUNTS handlers.
    REFRESH_COUNTS: {
      actions: assign({
        enrichedCount: ({ event }) => event.enriched,
        totalCount: ({ event }) => event.total,
      }),
    },
  },
  states: {
    loadingCounts: {
      invoke: {
        src: "loadCounts",
        onDone: [
          {
            guard: ({ event }) => event.output.total > 0 && event.output.enriched >= event.output.total,
            target: "complete",
            actions: assign({
              countsLoaded: true,
              enrichedCount: ({ event }) => event.output.enriched,
              totalCount: ({ event }) => event.output.total,
            }),
          },
          {
            target: "paused",
            actions: assign({
              countsLoaded: true,
              enrichedCount: ({ event }) => event.output.enriched,
              totalCount: ({ event }) => event.output.total,
            }),
          },
        ],
        onError: {
          target: "paused",
          actions: assign({ countsLoaded: true }),
        },
      },
    },
    paused: {
      on: {
        START: "running",
      },
    },
    running: {
      invoke: {
        src: "backfillLoop",
        input: ({ context }) => ({ skippedIds: context.skippedIds }),
      },
      on: {
        PAUSE: "paused",
        WORKOUT_ENRICHED: {
          actions: assign({
            enrichedCount: ({ context }) => context.enrichedCount + 1,
          }),
        },
        WORKOUT_SKIPPED: {
          actions: assign({
            skippedIds: ({ context, event }) => [...context.skippedIds, event.workoutId],
          }),
        },
        REFRESH_COUNTS: {
          actions: assign({
            enrichedCount: ({ event }) => event.enriched,
            totalCount: ({ event }) => event.total,
          }),
        },
        ALL_DONE: {
          target: "complete",
          actions: "bumpSyncGeneration",
        },
        AUTH_ERROR: "paused",
      },
    },
    complete: {
      on: {
        REFRESH_COUNTS: [
          {
            guard: ({ event }) => event.total > 0 && event.enriched < event.total,
            target: "paused",
            actions: assign({
              enrichedCount: ({ event }) => event.enriched,
              totalCount: ({ event }) => event.total,
            }),
          },
          {
            actions: assign({
              enrichedCount: ({ event }) => event.enriched,
              totalCount: ({ event }) => event.total,
            }),
          },
        ],
        START: "running",
      },
    },
  },
});

// --- Global actor ---

export const enrichmentActor = createActor(enrichmentMachine).start();

// --- React hooks ---

export function useEnrichmentSelector<T>(selector: (snap: SnapshotFrom<typeof enrichmentMachine>) => T): T {
  return useSelector(enrichmentActor, selector);
}

export const selectEnrichmentComplete = (snap: SnapshotFrom<typeof enrichmentMachine>) =>
  snap.context.totalCount > 0 && snap.context.enrichedCount >= snap.context.totalCount;
