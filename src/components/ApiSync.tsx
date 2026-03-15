import { useState } from "react";
import { login, fetchAllWorkouts } from "../lib/api";
import { insertWorkouts, getLatestWorkoutDate, queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";

/** Login form and sync controls for the Peloton API. */
export default function ApiSync() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);

  const { filters, setWorkouts } = useWorkoutStore();
  const session = useSessionStore((s) => s.session);
  const sessionLogin = useSessionStore((s) => s.login);
  const sessionLogout = useSessionStore((s) => s.logout);

  const handleLogin = async () => {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const result = await login(email, password);
      await sessionLogin(result);
      setPassword("");
      setStatus("Logged in successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!session) return;
    setError("");
    setStatus("Fetching workouts...");
    setLoading(true);
    setProgress(null);
    try {
      const since = await getLatestWorkoutDate();
      const workouts = await fetchAllWorkouts(
        session.userId,
        session.accessToken,
        (fetched, total) => setProgress({ fetched, total }),
        since,
      );
      if (workouts.length === 0) {
        setStatus("Already up to date.");
      } else {
        setStatus(`Saving ${workouts.length} new workouts...`);
        await insertWorkouts(workouts);
        const updated = await queryWorkouts(filters);
        setWorkouts(updated);
        setStatus(`Synced ${workouts.length} new workouts.`);
      }
    } catch (e) {
      console.error("Sync error:", e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleLogout = async () => {
    await sessionLogout();
    setStatus("");
    setError("");
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-gray-200 p-6">
      <h2 className="mb-4 text-lg font-semibold">Peloton API Sync</h2>

      {!session ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-3"
        >
          <input
            type="email"
            placeholder="Peloton email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={loading}
              className="flex-1 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Syncing..." : "Sync Workouts"}
            </button>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Log Out
            </button>
          </div>
          {progress && (
            <p className="text-sm text-gray-500">
              Fetched {progress.fetched} / {progress.total} workouts...
            </p>
          )}
        </div>
      )}

      {status && <p className="mt-3 text-sm text-green-600">{status}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
