import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login, fetchAllWorkouts } from "../lib/api";
import { insertWorkouts, getExistingWorkoutIds, queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";

interface Props {
  open: boolean;
  onComplete: () => void;
}

type Step = "signin" | "downloading" | "success";

const AUTO_SYNC_KEY = "wattson:autoSyncOnLaunch";

export default function SetupWizard({ open, onComplete }: Props) {
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [autoSync, setAutoSync] = useState(true);

  const sessionLogin = useSessionStore((s) => s.login);
  const { filters, setWorkouts } = useWorkoutStore();

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      await sessionLogin({ ...result, email, password });
      setStep("downloading");
      startSync(result.userId, result.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoading(false);
    }
  };

  const startSync = async (userId: string, accessToken: string) => {
    setError("");
    setLoading(true);
    setProgress(null);
    try {
      const existingIds = await getExistingWorkoutIds();
      const workouts = await fetchAllWorkouts(
        userId,
        accessToken,
        (fetched, total) => setProgress({ fetched, total }),
        existingIds,
      );
      if (workouts.length > 0) {
        await insertWorkouts(workouts);
      }
      const updated = await queryWorkouts(filters);
      setWorkouts(updated);
      setSyncedCount(workouts.length);
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    const session = useSessionStore.getState().session;
    if (session) {
      startSync(session.userId, session.accessToken);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(AUTO_SYNC_KEY, autoSync ? "true" : "false");
    onComplete();
  };

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.fetched / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onClose={() => {}} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          {step === "signin" && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Welcome to Wattson</h2>
              <p className="mb-4 text-sm text-gray-500">
                Sign in with your Peloton account to get started.
              </p>
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
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>
          )}

          {step === "downloading" && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">Downloading Workouts</h2>
              <p className="mb-4 text-sm text-gray-500">
                Fetching your workout history from Peloton...
              </p>
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {progress && (
                <p className="text-sm text-gray-500">
                  {progress.fetched} / {progress.total} workouts
                </p>
              )}
              {error && (
                <div className="mt-3">
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={handleRetry}
                    className="mt-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "success" && (
            <div>
              <h2 className="mb-1 text-lg font-semibold">You're All Set!</h2>
              <p className="mb-4 text-sm text-gray-500">
                {syncedCount === 0
                  ? "Your workouts are already up to date."
                  : `Synced ${syncedCount} workout${syncedCount === 1 ? "" : "s"}.`}
              </p>
              <label className="mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Automatically sync data on launch
              </label>
              <button
                onClick={handleComplete}
                className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Get Started
              </button>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
