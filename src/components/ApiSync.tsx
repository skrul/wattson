import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login } from "../lib/api";
import { syncWorkouts } from "../lib/sync";
import { deleteAllData } from "../lib/database";
import { clearCache } from "../lib/enrichmentCache";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";
import { useEnrichmentStore } from "../stores/enrichmentStore";

const LAST_EMAIL_KEY = "wattson:lastEmail";
const AUTO_SYNC_KEY = "wattson:autoSyncOnLaunch";

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
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [cacheStatus, setCacheStatus] = useState("");
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem(AUTO_SYNC_KEY) !== "false");

  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);
  const sessionLogin = useSessionStore((s) => s.login);
  const sessionLogout = useSessionStore((s) => s.logout);
  const isSyncing = useSessionStore((s) => s.isSyncing);
  const setWorkouts = useWorkoutStore((s) => s.setWorkouts);

  const countsLoaded = useEnrichmentStore((s) => s.countsLoaded);
  const backfillStatus = useEnrichmentStore((s) => s.backfillStatus);
  const enrichedCount = useEnrichmentStore((s) => s.enrichedCount);
  const totalCount = useEnrichmentStore((s) => s.totalCount);
  const startBackfill = useEnrichmentStore((s) => s.startBackfill);
  const pauseBackfill = useEnrichmentStore((s) => s.pauseBackfill);
  const resetEnrichment = useEnrichmentStore((s) => s.reset);


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

  const handleReset = async () => {
    setConfirmResetOpen(false);
    resetEnrichment();
    await deleteAllData();
    setWorkouts([]);
    localStorage.removeItem(LAST_EMAIL_KEY);
    setEmail("");
    onDataDeleted();
    await sessionLogout();
    setStatus("");
    setError("");
  };

  const handleClearCache = async () => {
    await clearCache();
    setCacheStatus("Cache cleared.");
    setTimeout(() => setCacheStatus(""), 3000);
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
          <p className="text-sm text-gray-500">
            {[
              memberSince ? `Member since ${memberSince}` : null,
              profile?.cyclingFtp != null ? `FTP ${profile.cyclingFtp}W` : null,
            ].filter(Boolean).join(" · ") || null}
          </p>
        </div>
      </div>

      {/* Data */}
      {countsLoaded && (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          {/* Summary line */}
          <p className="text-sm text-gray-900">
            <span className="font-semibold">{totalCount.toLocaleString()}</span>{" "}
            {totalCount === 1 ? "workout" : "workouts"}
            <span className="text-gray-500">
              {" · "}
              {backfillStatus === "complete"
                ? "All details downloaded"
                : backfillStatus === "running"
                  ? "Downloading details..."
                  : "Details paused"}
            </span>
          </p>

          {/* Progress bar (only when incomplete) */}
          {backfillStatus !== "complete" && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: totalCount > 0 ? `${(enrichedCount / totalCount) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {enrichedCount.toLocaleString()} / {totalCount.toLocaleString()}
              </p>
            </div>
          )}

          {/* Sync status messages */}
          {progress && (
            <p className="text-xs text-gray-500">
              Fetching workouts... {progress.fetched} / {progress.total}
            </p>
          )}
          {!status && isSyncing && !progress && <p className="text-xs text-gray-500">Checking for new workouts...</p>}
          {status && <p className="text-xs text-green-600">{status}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Button row */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={loading || isSyncing}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading || isSyncing ? "Syncing..." : "Sync Now"}
            </button>
            {backfillStatus !== "complete" && (
              <button
                onClick={() => backfillStatus === "running" ? pauseBackfill() : startBackfill()}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {backfillStatus === "running" ? "Pause" : "Resume"}
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => {
                  setAutoSync(e.target.checked);
                  localStorage.setItem(AUTO_SYNC_KEY, e.target.checked ? "true" : "false");
                }}
                className="rounded border-gray-300"
              />
              Sync on launch
            </label>
          </div>
        </div>
      )}

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
          onClick={() => setConfirmResetOpen(true)}
          disabled={loading}
          className="w-full rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Reset Workouts
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearCache}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            Clear Cache
          </button>
          {cacheStatus && <span className="text-xs text-green-600">{cacheStatus}</span>}
        </div>
      </div>

      {/* Reset Workouts confirmation dialog */}
      <Dialog open={confirmResetOpen} onClose={() => setConfirmResetOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Reset Workouts?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will delete all workouts and profile data, then log you out. Your enrichment cache is preserved, so re-syncing with detailed mode will repopulate instantly.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmResetOpen(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Reset Workouts
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
