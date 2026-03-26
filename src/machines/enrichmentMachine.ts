import { createActor, fromPromise, fromCallback, type SnapshotFrom } from "xstate";
import { useSelector } from "@xstate/react";
import { getUnenrichedWorkouts, getEnrichmentCounts, updateWorkoutMetrics, updateRideDetails } from "../lib/database";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "../lib/enrichmentCache";
import { authActor } from "./authMachine";
import { useWorkoutStore } from "../stores/workoutStore";
import { enrichmentMachine } from "./enrichmentMachine.config";

const ENRICHMENT_DELAY_MS = parseInt(import.meta.env.VITE_ENRICHMENT_DELAY_MS || "2000", 10);
const RECONCILE_INTERVAL = 25;

// --- Machine with real implementations ---

const realEnrichmentMachine = enrichmentMachine.provide({
  actors: {
    loadCounts: fromPromise(async () => {
      return getEnrichmentCounts();
    }),
    backfillLoop: fromCallback<
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
          const session = authActor.getSnapshot().context.session;
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
    }),
  },
  actions: {
    bumpSyncGeneration: () => {
      useWorkoutStore.setState((s) => ({ syncGeneration: s.syncGeneration + 1 }));
    },
  },
});

// --- Global actor ---

export const enrichmentActor = createActor(realEnrichmentMachine).start();

// --- React hooks ---

export function useEnrichmentSelector<T>(selector: (snap: SnapshotFrom<typeof enrichmentMachine>) => T): T {
  return useSelector(enrichmentActor, selector);
}

export const selectEnrichmentComplete = (snap: SnapshotFrom<typeof enrichmentMachine>) =>
  snap.context.totalCount > 0 && snap.context.enrichedCount >= snap.context.totalCount;
