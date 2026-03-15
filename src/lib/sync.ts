import { login, fetchAllWorkouts, AuthError } from "./api";
import { insertWorkouts, getExistingWorkoutIds, queryWorkouts } from "./database";
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

  const existingIds = await getExistingWorkoutIds();

  const doFetch = async (userId: string, accessToken: string) => {
    return fetchAllWorkouts(userId, accessToken, onProgress, existingIds);
  };

  let workouts;
  try {
    workouts = await doFetch(session.userId, session.accessToken);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;

    // Try silent refresh with stored credentials
    try {
      const refreshed = await login(session.email, session.password);
      await useSessionStore.getState().updateCredentials(refreshed.accessToken, session.password);
      workouts = await doFetch(refreshed.userId, refreshed.accessToken);
    } catch {
      // Silent refresh failed — show re-auth modal
      const result = await useReauthStore.getState().requestReauth(session.email);
      workouts = await doFetch(result.userId, result.accessToken);
    }
  }

  if (workouts.length > 0) {
    await insertWorkouts(workouts);
    const filters = useWorkoutStore.getState().filters;
    const updated = await queryWorkouts(filters);
    useWorkoutStore.getState().setWorkouts(updated);
  }

  return workouts.length;
}
