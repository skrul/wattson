import { useState, useEffect } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login } from "../lib/api";
import { syncWorkouts } from "../lib/sync";
import { deleteAllData, getWorkoutCount } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";
import { useEnrichmentStore } from "../stores/enrichmentStore";

const LAST_EMAIL_KEY = "wattson:lastEmail";

interface Props {
  onDataDeleted: () => void;
}

/** Helper to extract fields from UserProfile.raw_json. */
function parseProfileRaw(rawJson: string) {
  try {
    const raw = JSON.parse(rawJson);
    return {
      username: (raw.username as string) ?? null,
      imageUrl: (raw.image_url as string) ?? null,
      createdAt: typeof raw.created_at === "number" ? raw.created_at : null,
      cyclingFtp: typeof raw.cycling_ftp === "number" ? raw.cycling_ftp : null,
    };
  } catch {
    return { username: null, imageUrl: null, createdAt: null, cyclingFtp: null };
  }
}

/** Profile / account tab: shows user info when logged in, login form when not. */
export default function ApiSync({ onDataDeleted }: Props) {
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const savedEmail = localStorage.getItem(LAST_EMAIL_KEY);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [workoutCount, setWorkoutCount] = useState<number | null>(null);

  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);
  const sessionLogin = useSessionStore((s) => s.login);
  const sessionLogout = useSessionStore((s) => s.logout);
  const setWorkouts = useWorkoutStore((s) => s.setWorkouts);

  const enrichmentMode = useEnrichmentStore((s) => s.mode);
  const backfillStatus = useEnrichmentStore((s) => s.backfillStatus);
  const enrichedCount = useEnrichmentStore((s) => s.enrichedCount);
  const totalCount = useEnrichmentStore((s) => s.totalCount);
  const enableDetailedMode = useEnrichmentStore((s) => s.enableDetailedMode);
  const disableDetailedMode = useEnrichmentStore((s) => s.disableDetailedMode);
  const startBackfill = useEnrichmentStore((s) => s.startBackfill);
  const pauseBackfill = useEnrichmentStore((s) => s.pauseBackfill);

  useEffect(() => {
    if (session) {
      getWorkoutCount().then(setWorkoutCount).catch(() => {});
    }
  }, [session]);

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
      const wc = await getWorkoutCount();
      setWorkoutCount(wc);
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
    setWorkoutCount(null);
  };

  const handleDeleteAll = async () => {
    setConfirmDeleteOpen(false);
    await disableDetailedMode();
    await deleteAllData();
    setWorkouts([]);
    localStorage.removeItem(LAST_EMAIL_KEY);
    setEmail("");
    onDataDeleted();
    await sessionLogout();
    setStatus("");
    setError("");
    setWorkoutCount(null);
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-lg font-semibold">Log in to Peloton</h2>
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
        {status && <p className="mt-3 text-sm text-green-600">{status}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const profile = userProfile ? parseProfileRaw(userProfile.raw_json) : null;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-md space-y-6">
      {/* Profile header */}
      <div className="flex items-center gap-4">
        {profile?.imageUrl ? (
          <img
            src={profile.imageUrl}
            alt={profile.username ?? ""}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl font-bold text-gray-500">
            {profile?.username?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold">{profile?.username ?? "Peloton User"}</h2>
          {memberSince && (
            <p className="text-sm text-gray-500">Member since {memberSince}</p>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {profile?.cyclingFtp != null && (
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-medium uppercase text-gray-500">FTP</p>
            <p className="text-lg font-semibold">{profile.cyclingFtp}W</p>
          </div>
        )}
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium uppercase text-gray-500">Total Workouts</p>
          <p className="text-lg font-semibold">{workoutCount ?? "—"}</p>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="space-y-3 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Detailed Metrics</p>
            <p className="text-xs text-gray-500">
              Fetch per-workout performance data (calories, distance, output, etc.)
            </p>
          </div>
          <button
            onClick={() => enrichmentMode === "detailed" ? disableDetailedMode() : enableDetailedMode()}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              enrichmentMode === "detailed" ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enrichmentMode === "detailed" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {enrichmentMode === "detailed" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {backfillStatus === "complete"
                  ? "All workouts enriched"
                  : backfillStatus === "running"
                    ? "Enriching workouts..."
                    : "Enrichment paused"}
              </span>
              <span className="text-gray-500">
                {enrichedCount} / {totalCount}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: totalCount > 0 ? `${(enrichedCount / totalCount) * 100}%` : "0%" }}
              />
            </div>
            {backfillStatus !== "complete" && (
              <button
                onClick={() => backfillStatus === "running" ? pauseBackfill() : startBackfill()}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                {backfillStatus === "running" ? "Pause" : "Resume"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sync */}
      <div className="space-y-2">
        <button
          onClick={handleSync}
          disabled={loading}
          className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Syncing..." : "Sync Now"}
        </button>
        {progress && (
          <p className="text-sm text-gray-500">
            Fetched {progress.fetched} / {progress.total} workouts...
          </p>
        )}
        {status && <p className="text-sm text-green-600">{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-gray-200 pt-4">
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="w-full rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Log Out
        </button>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={loading}
          className="w-full rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete All Data
        </button>
      </div>

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
