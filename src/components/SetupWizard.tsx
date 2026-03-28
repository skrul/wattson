import { useEffect, useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login } from "../lib/api";
import { authActor } from "../machines/authMachine";
import { syncActor, useSyncSelector, selectSyncProgress, selectSyncDone, selectSyncError, selectSyncNewCount } from "../machines/syncMachine";
import { STORAGE_KEYS } from "../lib/storageKeys";

interface Props {
  open: boolean;
  onComplete: () => void;
}

type Step = "signin" | "downloading" | "success";

export default function SetupWizard({ open, onComplete }: Props) {
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [autoSync, setAutoSync] = useState(true);

  const progress = useSyncSelector(selectSyncProgress);
  const syncDone = useSyncSelector(selectSyncDone);
  const syncError = useSyncSelector(selectSyncError);
  const syncNewCount = useSyncSelector(selectSyncNewCount);

  // Reset wizard state when re-opened
  useEffect(() => {
    if (open) {
      setStep("signin");
      setEmail("");
      setPassword("");
      setError("");
      setLoading(false);
      setSyncedCount(0);
      setAutoSync(true);
      syncActor.send({ type: "RESET" });
    }
  }, [open]);

  // Advance to success when sync completes
  useEffect(() => {
    if (step === "downloading" && syncDone) {
      setSyncedCount(syncNewCount);
      setStep("success");
    }
  }, [step, syncDone, syncNewCount]);

  // Show error when sync fails
  useEffect(() => {
    if (step === "downloading" && syncError) {
      setError(syncError);
    }
  }, [step, syncError]);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      authActor.send({ type: "LOGIN_SUCCESS", session: { ...result, email, password } });
      localStorage.setItem(STORAGE_KEYS.lastEmail, email);
      setStep("downloading");
      syncActor.send({ type: "SYNC" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setError("");
    syncActor.send({ type: "SYNC" });
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEYS.autoSyncOnLaunch, autoSync ? "true" : "false");
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
              <p className="mb-4 text-sm text-gray-500">
                Detailed workout data will continue downloading in the background. Some filters and insights may be unavailable until this completes.
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
