import { createActor, fromCallback, type SnapshotFrom } from "xstate";
import { useSelector } from "@xstate/react";
import { fetchAllWorkouts, fetchUserProfile, AuthError } from "../lib/api";
import {
  cachedFetchPerformanceGraph,
  cachedFetchWorkoutDetail,
  cachedFetchRideDetails,
} from "../lib/enrichmentCache";
import {
  insertWorkouts,
  getExistingWorkoutIds,
  queryWorkouts,
  upsertUserProfile,
  updateWorkoutMetrics,
  updateRideDetails,
  getEnrichmentCounts,
} from "../lib/database";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkoutStore } from "../stores/workoutStore";
import { enrichmentActor } from "./enrichmentMachine";
import { authActor, refreshAuth } from "./authMachine";
import { syncMachine, type SyncEvent } from "./syncMachine.config";

// --- Machine with real implementations ---

const realSyncMachine = syncMachine.provide({
  actors: {
    syncWorker: fromCallback<SyncEvent>(({ sendBack }) => {
      let aborted = false;

      (async () => {
        const session = authActor.getSnapshot().context.session;
        if (!session) throw new Error("Not logged in");

        const cachedProfile = useSessionStore.getState().userProfile;
        const totalWorkouts = cachedProfile?.total_workouts ?? undefined;

        const existingIds = await getExistingWorkoutIds();

        // If we have fewer workouts than the account total, force a full sync
        // to catch gaps from interrupted syncs. Otherwise, enable early-stop.
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

        // Fetch profile concurrently so the avatar updates while workouts download.
        // Non-fatal: if it fails (e.g. expired token), we retry after auth recovery below.
        const fetchAndCacheProfile = async (token: string) => {
          try {
            const profile = await fetchUserProfile(token);
            await upsertUserProfile(profile);
            useSessionStore.getState().setUserProfile(profile);
          } catch {
            // Non-fatal: will be retried with refreshed token or on next sync
          }
        };

        let workouts;
        let activeToken = session.accessToken;
        const profilePromise = fetchAndCacheProfile(activeToken);
        try {
          workouts = await doFetch(session.userId, activeToken);
        } catch (e) {
          if (!(e instanceof AuthError)) throw e;
          try {
            activeToken = await refreshAuth();
          } catch {
            if (!aborted) sendBack({ type: "AUTH_ERROR" });
            return;
          }
          workouts = await doFetch(session.userId, activeToken);
        }

        // If token changed during auth recovery, re-fetch profile with the new token
        if (activeToken !== session.accessToken) {
          fetchAndCacheProfile(activeToken);
        }
        await profilePromise;

        const newWorkouts = workouts.filter((w) => !existingIds.has(w.id));

        if (newWorkouts.length > 0) {
          await insertWorkouts(newWorkouts);

          // Update enrichment counts immediately so the UI reflects the new workout count
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

          // Inline enrichment: fetch all detail endpoints for each new workout.
          // Only runs on incremental syncs (isComplete); initial/full syncs rely on backfill.
          if (isComplete) {
            for (const w of newWorkouts) {
              if (aborted) break;
              try {
                const rideId =
                  w.ride_id &&
                  w.ride_id !== "00000000000000000000000000000000"
                    ? w.ride_id
                    : null;

                const [perfResult, detailResult, rideResult] =
                  await Promise.all([
                    cachedFetchPerformanceGraph(w.id, activeToken),
                    cachedFetchWorkoutDetail(w.id, activeToken).catch(
                      () => null,
                    ),
                    rideId
                      ? cachedFetchRideDetails(rideId, activeToken).catch(
                          () => null,
                        )
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
                // Non-fatal: enrichment backfill will retry later
              }
            }
            const refreshedCounts = await getEnrichmentCounts();
            enrichmentActor.send({
              type: "REFRESH_COUNTS",
              enriched: refreshedCounts.enriched,
              total: refreshedCounts.total,
            });
            // Re-notify so dashboard widgets refetch with enriched data
            useWorkoutStore.getState().notifySync();
          }
        }

        // Kick off backfill if there are unenriched workouts remaining
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

// --- Global actor ---

export const syncActor = createActor(realSyncMachine).start();

// --- React hooks ---

type SyncSnapshot = SnapshotFrom<typeof syncMachine>;

export function useSyncSelector<T>(selector: (snap: SyncSnapshot) => T): T {
  return useSelector(syncActor, selector);
}

// --- Selectors ---

export const selectIsSyncing = (snap: SyncSnapshot) =>
  snap.matches("syncing");

export const selectSyncProgress = (snap: SyncSnapshot) =>
  snap.context.progress;

export const selectSyncError = (snap: SyncSnapshot) =>
  snap.context.error;

export const selectSyncNewCount = (snap: SyncSnapshot) =>
  snap.context.newCount;

export const selectSyncDone = (snap: SyncSnapshot) =>
  snap.matches("done");
