/**
 * Enrichment state machine definition.
 *
 * To visualize: copy this entire file into https://stately.ai/editor
 *
 * Note: `as any` casts are needed because guards/actions defined in setup()
 * don't have access to narrowed onDone/onError event types.
 */
import { setup, assign, fromPromise, fromCallback } from "xstate";

// --- Types ---

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

// --- Machine ---

export const enrichmentMachine = setup({
  types: {
    context: {} as EnrichmentContext,
    events: {} as EnrichmentEvent,
  },
  actors: {
    loadCounts: fromPromise<{ enriched: number; total: number }>(
      async () => ({ enriched: 0, total: 0 }),
    ),
    backfillLoop: fromCallback<{ type: "PAUSE" }, { skippedIds: string[] }>(
      () => () => {},
    ),
  },
  guards: {
    allEnriched: ({ event }: any) =>
      event.output.total > 0 && event.output.enriched >= event.output.total,
    hasUnenriched: ({ event }: any) =>
      event.total > 0 && event.enriched < event.total,
  },
  actions: {
    resetContext: assign({
      enrichedCount: 0,
      totalCount: 0,
      countsLoaded: false,
      skippedIds: [] as string[],
      sinceLastReconcile: 0,
    }),
    updateCounts: assign({
      enrichedCount: ({ event }: any) => event.enriched,
      totalCount: ({ event }: any) => event.total,
    }),
    setLoadedCounts: assign({
      countsLoaded: true,
      enrichedCount: ({ event }: any) => event.output.enriched,
      totalCount: ({ event }: any) => event.output.total,
    }),
    markCountsLoaded: assign({ countsLoaded: true }),
    incrementEnriched: assign({
      enrichedCount: ({ context }: any) => context.enrichedCount + 1,
    }),
    addSkippedId: assign({
      skippedIds: ({ context, event }: any) => [...context.skippedIds, event.workoutId],
    }),
    bumpSyncGeneration: () => {},
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
      description: "Clear all enrichment state and reload counts from DB.",
      target: ".loadingCounts",
      actions: "resetContext",
    },
    REFRESH_COUNTS: {
      description: "Update enriched/total counts (e.g. after sync inserts new workouts).",
      actions: "updateCounts",
    },
  },
  states: {
    loadingCounts: {
      description: "Query the database for enriched/total workout counts on startup.",
      invoke: {
        src: "loadCounts",
        onDone: [
          {
            guard: "allEnriched",
            target: "complete",
            actions: "setLoadedCounts",
          },
          {
            target: "paused",
            actions: "setLoadedCounts",
          },
        ],
        onError: {
          target: "paused",
          actions: "markCountsLoaded",
        },
      },
    },
    paused: {
      description: "Backfill is not running. Waiting for user to start or for a sync to complete.",
      on: {
        START: {
          description: "Begin enrichment backfill.",
          target: "running",
        },
      },
    },
    running: {
      description: "Backfill loop is active, enriching one workout at a time with throttled API calls.",
      invoke: {
        src: "backfillLoop",
        input: ({ context }) => ({ skippedIds: context.skippedIds }),
      },
      on: {
        PAUSE: {
          description: "User paused enrichment backfill.",
          target: "paused",
        },
        WORKOUT_ENRICHED: {
          description: "One workout successfully enriched.",
          actions: "incrementEnriched",
        },
        WORKOUT_SKIPPED: {
          description: "Workout enrichment failed; skipped for this run.",
          actions: "addSkippedId",
        },
        REFRESH_COUNTS: {
          description: "Periodic reconciliation of counts from DB.",
          actions: "updateCounts",
        },
        ALL_DONE: {
          description: "No more unenriched workouts remain.",
          target: "complete",
          actions: "bumpSyncGeneration",
        },
        AUTH_ERROR: {
          description: "API auth failed during enrichment; pause until resolved.",
          target: "paused",
        },
      },
    },
    complete: {
      description: "All workouts are enriched. Reverts to paused if new unenriched workouts appear after a sync.",
      on: {
        REFRESH_COUNTS: [
          {
            description: "New unenriched workouts detected after sync; revert to paused.",
            guard: "hasUnenriched",
            target: "paused",
            actions: "updateCounts",
          },
          {
            description: "Counts updated but still fully enriched.",
            actions: "updateCounts",
          },
        ],
        START: {
          description: "Force restart enrichment.",
          target: "running",
        },
      },
    },
  },
});
