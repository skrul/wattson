import { useState, useEffect } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import {
  authActor,
  useAuthSelector,
  selectIsAwaitingReauth,
  selectIsReauthing,
  selectReauthError,
  selectSession,
} from "../machines/authMachine";

export default function ReauthModal() {
  const open = useAuthSelector(selectIsAwaitingReauth);
  const loading = useAuthSelector(selectIsReauthing);
  const error = useAuthSelector(selectReauthError);
  const email = useAuthSelector((snap) => selectSession(snap)?.email ?? "");

  const [password, setPassword] = useState("");

  // Reset password when modal opens
  useEffect(() => {
    if (open) setPassword("");
  }, [open]);

  const handleSubmit = () => {
    authActor.send({ type: "REAUTH_SUBMIT", password });
  };

  const handleDismiss = () => {
    setPassword("");
    authActor.send({ type: "REAUTH_DISMISS" });
  };

  return (
    <Dialog open={open} onClose={handleDismiss} className="relative z-50">
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
              value={email}
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
