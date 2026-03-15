import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login } from "../lib/api";
import { syncWorkouts } from "../lib/sync";
import { deleteAllData } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";

const LAST_EMAIL_KEY = "wattson:lastEmail";

interface Props {
  onDataDeleted: () => void;
}

/** Login form and sync controls for the Peloton API. */
export default function ApiSync({ onDataDeleted }: Props) {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const savedEmail = localStorage.getItem(LAST_EMAIL_KEY);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const session = useSessionStore((s) => s.session);
  const sessionLogin = useSessionStore((s) => s.login);
  const sessionLogout = useSessionStore((s) => s.logout);
  const setWorkouts = useWorkoutStore((s) => s.setWorkouts);

  const handleLogin = async () => {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const result = await login(email, password);
      await sessionLogin({ ...result, email, password });
      localStorage.setItem(LAST_EMAIL_KEY, email);
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
      const count = await syncWorkouts(
        (fetched, total) => setProgress({ fetched, total }),
      );
      if (count === 0) {
        setStatus("Already up to date.");
      } else {
        setStatus(`Synced ${count} new workouts.`);
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

  const handleSignOut = async () => {
    await sessionLogout();
    setStatus("");
    setError("");
  };

  const handleDeleteAll = async () => {
    setConfirmDeleteOpen(false);
    await deleteAllData();
    setWorkouts([]);
    localStorage.removeItem(LAST_EMAIL_KEY);
    setEmail("");
    onDataDeleted();
    await sessionLogout();
    setStatus("");
    setError("");
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-gray-200 p-6">
      <h2 className="mb-4 text-lg font-semibold">Peloton API Sync</h2>

      {!session ? (
        <div className="space-y-4">
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
              readOnly={!!savedEmail}
              required
              className={`w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none${savedEmail ? " bg-gray-100 text-gray-500" : ""}`}
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

          <button
            onClick={() => setConfirmDeleteOpen(true)}
            className="w-full rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete All Data
          </button>
        </div>
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
              onClick={handleSignOut}
              disabled={loading}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Sign Out
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

      {/* Delete All Data confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete All Data?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete all your cached workouts and profile data. You will need to log in and sync again to restore your data.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete All Data
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
