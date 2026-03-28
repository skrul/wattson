/**
 * Sync state machine definition.
 *
 * To visualize: copy this entire file into https://stately.ai/editor
 *
 * Note: `as any` casts are needed because guards/actions defined in setup()
 * don't have access to narrowed onDone/onError event types.
 */
import { setup, assign, fromCallback } from "xstate";

// --- Types ---

export type SyncEvent =
  | { type: "SYNC" }
  | { type: "PROGRESS"; fetched: number; total: number }
  | { type: "COMPLETE"; newCount: number }
  | { type: "AUTH_ERROR" }
  | { type: "SYNC_ERROR"; message: string }
  | { type: "RESET" };

export interface SyncContext {
  progress: { fetched: number; total: number } | null;
  newCount: number;
  error: string | null;
}

// --- Machine ---

export const syncMachine = setup({
  types: {
    context: {} as SyncContext,
    events: {} as SyncEvent,
  },
  actors: {
    syncWorker: fromCallback<SyncEvent>(() => () => {}),
  },
  actions: {
    resetContext: assign({
      progress: null as SyncContext["progress"],
      newCount: 0,
      error: null as string | null,
    }),
    clearForSync: assign({
      progress: null as SyncContext["progress"],
      error: null as string | null,
    }),
    setProgress: assign({
      progress: ({ event }: any) => ({
        fetched: event.fetched as number,
        total: event.total as number,
      }),
    }),
    setComplete: assign({
      newCount: ({ event }: any) => event.newCount as number,
    }),
    setAuthError: assign({
      error: "Authentication failed",
    }),
    setSyncError: assign({
      error: ({ event }: any) => event.message as string,
    }),
  },
}).createMachine({
  id: "sync",
  initial: "idle",
  context: {
    progress: null,
    newCount: 0,
    error: null,
  },
  on: {
    RESET: {
      target: ".idle",
      actions: "resetContext",
    },
  },
  states: {
    idle: {
      description: "No sync in progress. Waiting for user or auto-sync to trigger.",
      on: {
        SYNC: {
          target: "syncing",
          actions: "clearForSync",
        },
      },
    },
    syncing: {
      description: "Sync is in progress. The syncWorker actor handles fetching, inserting, and inline enrichment.",
      invoke: {
        src: "syncWorker",
      },
      on: {
        PROGRESS: {
          actions: "setProgress",
        },
        COMPLETE: {
          target: "done",
          actions: "setComplete",
        },
        AUTH_ERROR: {
          target: "error",
          actions: "setAuthError",
        },
        SYNC_ERROR: {
          target: "error",
          actions: "setSyncError",
        },
      },
    },
    done: {
      description: "Sync completed. Persists newCount for UI display until next sync or reset.",
      on: {
        SYNC: {
          target: "syncing",
          actions: "clearForSync",
        },
        RESET: {
          target: "idle",
          actions: "resetContext",
        },
      },
    },
    error: {
      description: "Sync failed. User can retry or reset.",
      on: {
        SYNC: {
          target: "syncing",
          actions: "clearForSync",
        },
        RESET: {
          target: "idle",
          actions: "resetContext",
        },
      },
    },
  },
});
