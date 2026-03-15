import { login, fetchAllWorkouts, fetchUserProfile, AuthError } from "./api";
import { insertWorkouts, getExistingWorkoutIds, queryWorkouts, upsertUserProfile } from "./database";
import { useSessionStore } from "../stores/sessionStore";
import { useReauthStore } from "../stores/reauthStore";
import { useWorkoutStore } from "../stores/workoutStore";

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

  const cachedProfile = useSessionStore.getState().userProfile;
  const totalWorkouts = cachedProfile?.total_workouts ?? undefined;

  const existingIds = await getExistingWorkoutIds();

  // If we have fewer workouts than the account total, force a full sync
  // to catch gaps from interrupted syncs. Otherwise, enable early-stop.
  const isComplete = totalWorkouts != null && existingIds.size >= totalWorkouts;

  const doFetch = async (userId: string, accessToken: string) => {
    return fetchAllWorkouts(
      userId,
      accessToken,
      onProgress,
      isComplete ? existingIds : undefined,
      totalWorkouts,
    );
  };

  let workouts;
  let activeToken = session.accessToken;
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

  if (workouts.length > 0) {
    await insertWorkouts(workouts);
    const filters = useWorkoutStore.getState().filters;
    const updated = await queryWorkouts(filters);
    useWorkoutStore.getState().setWorkouts(updated);
  }

  // Fetch and cache user profile
  try {
    const profile = await fetchUserProfile(activeToken);
    await upsertUserProfile(profile);
    useSessionStore.getState().setUserProfile(profile);
  } catch (e) {
    console.error("Failed to fetch user profile:", e);
  }

  return workouts.length;
}
