import { createActor, fromPromise, type SnapshotFrom } from "xstate";
import { useSelector } from "@xstate/react";
import { invoke } from "@tauri-apps/api/core";
import { login } from "../lib/api";
import { useSessionStore } from "../stores/sessionStore";
import { authMachine } from "./authMachine.config";

export type { Session } from "./authMachine.config";

// --- Deferred auth helper ---

let authDeferred: {
  promise: Promise<string>;
  resolve: (token: string) => void;
  reject: (error: Error) => void;
} | null = null;

/**
 * Request an auth refresh. Concurrent callers piggyback on the same deferred.
 * Returns a promise that resolves with a fresh accessToken.
 */
export function refreshAuth(): Promise<string> {
  if (authDeferred) return authDeferred.promise;

  let resolve!: (token: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  authDeferred = { promise, resolve, reject };

  authActor.send({ type: "AUTH_FAILURE" });
  return promise;
}

// --- Machine with real implementations ---

const realAuthMachine = authMachine.provide({
  actors: {
    loadKeychain: fromPromise(async () => {
      const creds = await invoke("load_credentials");
      if (!creds) return null;
      const { user_id, access_token, email, password } = creds as {
        user_id: string;
        access_token: string;
        email?: string;
        password?: string;
      };
      if (!email || !password) return null; // Legacy entry — force re-login
      return { userId: user_id, accessToken: access_token, email, password };
    }),
    silentRefresh: fromPromise(async ({ input }: { input: { email: string; password: string } }) => {
      const result = await login(input.email, input.password);
      return { accessToken: result.accessToken, userId: result.userId };
    }),
    performReauth: fromPromise(async ({ input }: { input: { email: string; password: string } }) => {
      const result = await login(input.email, input.password);
      return { accessToken: result.accessToken, userId: result.userId, password: input.password };
    }),
    deleteKeychain: fromPromise(async () => {
      await invoke("delete_credentials").catch(() => {});
    }),
  },
  actions: {
    persistKeychain: ({ context }) => {
      if (context.session) {
        invoke("save_credentials", {
          userId: context.session.userId,
          accessToken: context.session.accessToken,
          email: context.session.email,
          password: context.session.password,
        }).catch(() => {});
      }
    },
    resolveDeferred: ({ context }) => {
      if (authDeferred && context.session) {
        authDeferred.resolve(context.session.accessToken);
        authDeferred = null;
      }
    },
    rejectDeferred: () => {
      if (authDeferred) {
        authDeferred.reject(new Error("Auth cancelled"));
        authDeferred = null;
      }
    },
    clearUserProfile: () => {
      useSessionStore.setState({ userProfile: null });
    },
  },
});

// --- Global actor ---

export const authActor = createActor(realAuthMachine).start();

// --- React hooks ---

type AuthSnapshot = SnapshotFrom<typeof authMachine>;

export function useAuthSelector<T>(selector: (snap: AuthSnapshot) => T): T {
  return useSelector(authActor, selector);
}

export const selectSession = (snap: AuthSnapshot) => snap.context.session;
export const selectIsLoaded = (snap: AuthSnapshot) =>
  !snap.matches("loadingKeychain");
export const selectIsAwaitingReauth = (snap: AuthSnapshot) =>
  snap.matches({ loggedIn: "awaitingReauth" }) || snap.matches({ loggedIn: "reauthing" });
export const selectIsReauthing = (snap: AuthSnapshot) =>
  snap.matches({ loggedIn: "reauthing" });
export const selectReauthError = (snap: AuthSnapshot) => snap.context.reauthError;
