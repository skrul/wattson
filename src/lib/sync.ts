import { login, fetchAllWorkouts, fetchUserProfile, AuthError } from "./api";
import { cachedFetchPerformanceGraph, cachedFetchWorkoutDetail, cachedFetchRideDetails } from "./enrichmentCache";
import { insertWorkouts, getExistingWorkoutIds, queryWorkouts, upsertUserProfile, updateWorkoutMetrics, updateRideDetails } from "./database";
import { useSessionStore } from "../stores/sessionStore";
import { useReauthStore } from "../stores/reauthStore";
import { useWorkoutStore } from "../stores/workoutStore";
import { useEnrichmentStore } from "../stores/enrichmentStore";

/**
 * Sync workouts with retry logic for expired tokens.
 * On AuthError: tries silent re-login with stored credentials,
 * then falls back to a re-auth modal if that fails.
 */
export async function syncWorkouts(
  onProgress?: (fetched: number, total: number) => void,
): Promise<number> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error("Not logged in");

  useSessionStore.getState().setIsSyncing(true);

  const cachedProfile = useSessionStore.getState().userProfile;
  const totalWorkouts = cachedProfile?.total_workouts ?? undefined;

  const existingIds = await getExistingWorkoutIds();

  // If we have fewer workouts than the account total, force a full sync
  // to catch gaps from interrupted syncs. Otherwise, enable early-stop.
  const isComplete = totalWorkouts != null && existingIds.size >= totalWorkouts;

  const reportProgress = (fetched: number, total: number) => {
    useSessionStore.getState().setSyncProgress({ fetched, total });
    onProgress?.(fetched, total);
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

    // Try silent refresh with stored credentials
    try {
      const refreshed = await login(session.email, session.password);
      await useSessionStore.getState().updateCredentials(refreshed.accessToken, session.password);
      activeToken = refreshed.accessToken;
      workouts = await doFetch(refreshed.userId, activeToken);
    } catch {
      // Silent refresh failed — show re-auth modal
      const result = await useReauthStore.getState().requestReauth(session.email);
      activeToken = result.accessToken;
      workouts = await doFetch(result.userId, activeToken);
    }
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
    await useEnrichmentStore.getState().refreshCounts();

    const filters = useWorkoutStore.getState().filters;
    const updated = await queryWorkouts(filters);
    useWorkoutStore.getState().setWorkouts(updated);
    useWorkoutStore.getState().notifySync();
    useSessionStore.getState().setIsSyncing(false);

    // Inline enrichment: fetch all detail endpoints for each new workout.
    // Only runs on incremental syncs (isComplete); initial/full syncs rely on backfill.
    if (isComplete) {
      for (const w of newWorkouts) {
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
          // Non-fatal: enrichment backfill will retry later
        }
      }
      await useEnrichmentStore.getState().refreshCounts();
      // Re-notify so dashboard widgets refetch with enriched data
      useWorkoutStore.getState().notifySync();
    }
  } else {
    useSessionStore.getState().setIsSyncing(false);
  }

  // Kick off backfill if there are unenriched workouts remaining
  useEnrichmentStore.getState().ensureRunning();

  return newWorkouts.length;
}
