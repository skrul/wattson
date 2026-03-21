import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { login } from "../lib/api";
import { useReauthStore } from "../stores/reauthStore";
import { useSessionStore } from "../stores/sessionStore";

export default function ReauthModal() {
  const pending = useReauthStore((s) => s.pending);
  const resolveReauth = useReauthStore((s) => s.resolveReauth);
  const rejectReauth = useReauthStore((s) => s.rejectReauth);
  const updateCredentials = useSessionStore((s) => s.updateCredentials);

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!pending) return;
    setError("");
    setLoading(true);
    try {
      const result = await login(pending.email, password);
      await updateCredentials(result.accessToken, password);
      resolveReauth(result);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setPassword("");
    setError("");
    rejectReauth(new Error("Re-authentication dismissed"));
  };

  return (
    <Dialog open={pending !== null} onClose={handleDismiss} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
          <h2 className="mb-1 text-lg font-semibold">Session Expired</h2>
          <p className="mb-4 text-sm text-gray-500">
            Your Peloton session has expired. Please re-enter your password to continue syncing.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-3"
          >
            <input
              type="email"
              value={pending?.email ?? ""}
              disabled
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={loading}
              className="w-full rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Not Now
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
