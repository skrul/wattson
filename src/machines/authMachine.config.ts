/**
 * Auth state machine definition.
 *
 * To visualize: copy this entire file into https://stately.ai/editor
 *
 * Note: `as any` casts are needed because guards/actions defined in setup()
 * don't have access to narrowed onDone/onError event types.
 */
import { setup, assign, fromPromise } from "xstate";

// --- Types ---

export interface Session {
  userId: string;
  accessToken: string;
  email: string;
  password: string;
}

interface AuthContext {
  session: Session | null;
  reauthError: string | null;
}

type AuthEvent =
  | { type: "LOGIN_SUCCESS"; session: Session }
  | { type: "LOGOUT" }
  | { type: "AUTH_FAILURE" }
  | { type: "REAUTH_SUBMIT"; password: string }
  | { type: "REAUTH_DISMISS" };

// --- Machine ---

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  actors: {
    loadKeychain: fromPromise<Session | null>(async () => null),
    silentRefresh: fromPromise<
      { accessToken: string; userId: string },
      { email: string; password: string }
    >(async () => ({ accessToken: "", userId: "" })),
    performReauth: fromPromise<
      { accessToken: string; userId: string; password: string },
      { email: string; password: string }
    >(async () => ({ accessToken: "", userId: "", password: "" })),
    deleteKeychain: fromPromise<void>(async () => {}),
  },
  guards: {
    hasSession: ({ event }: any) => event.output != null,
    allEnriched: ({ event }: any) =>
      event.output.total > 0 && event.output.enriched >= event.output.total,
  },
  actions: {
    setSessionFromKeychain: assign({ session: ({ event }: any) => event.output }),
    setSessionFromLogin: assign({ session: ({ event }: any) => event.session }),
    updateAccessToken: assign({
      session: ({ context, event }: any) => ({
        ...context.session!,
        accessToken: event.output.accessToken,
      }),
    }),
    clearReauthError: assign({ reauthError: null as string | null }),
    updateSessionFromReauth: assign({
      session: ({ context, event }: any) => ({
        ...context.session!,
        accessToken: event.output.accessToken,
        password: event.output.password,
      }),
      reauthError: null as string | null,
    }),
    setReauthError: assign({
      reauthError: ({ event }: any) =>
        event.error instanceof Error ? event.error.message : "Login failed",
    }),
    clearSession: assign({ session: null as Session | null, reauthError: null as string | null }),
    persistKeychain: () => {},
    resolveDeferred: () => {},
    rejectDeferred: () => {},
    clearUserProfile: () => {},
  },
}).createMachine({
  id: "auth",
  initial: "loadingKeychain",
  context: {
    session: null,
    reauthError: null,
  },
  states: {
    loadingKeychain: {
      description: "Load stored credentials from the OS keychain on app startup.",
      invoke: {
        src: "loadKeychain",
        onDone: [
          {
            guard: "hasSession",
            target: "loggedIn",
            actions: "setSessionFromKeychain",
          },
          { target: "loggedOut" },
        ],
        onError: { target: "loggedOut" },
      },
    },

    loggedOut: {
      description: "No active session. Waiting for user to log in.",
      on: {
        LOGIN_SUCCESS: {
          description: "User successfully authenticated with Peloton.",
          target: "loggedIn",
          actions: ["setSessionFromLogin", "persistKeychain"],
        },
      },
    },

    loggedIn: {
      description: "User is authenticated with a valid session.",
      initial: "idle",
      exit: "rejectDeferred",
      on: {
        LOGOUT: {
          description: "User initiated sign out.",
          target: "loggingOut",
        },
      },
      states: {
        idle: {
          description: "Session is valid. Normal operation.",
          on: {
            AUTH_FAILURE: {
              description: "API returned 401; token may be expired.",
              target: "refreshing",
            },
          },
        },

        refreshing: {
          description: "API returned 401. Attempting silent re-login with stored credentials.",
          invoke: {
            src: "silentRefresh",
            input: ({ context }) => ({
              email: context.session!.email,
              password: context.session!.password,
            }),
            onDone: {
              target: "idle",
              actions: ["updateAccessToken", "persistKeychain", "resolveDeferred"],
            },
            onError: {
              target: "awaitingReauth",
            },
          },
        },

        awaitingReauth: {
          description: "Silent refresh failed. Showing modal for user to re-enter password.",
          on: {
            REAUTH_SUBMIT: {
              description: "User submitted new password in reauth modal.",
              target: "reauthing",
              actions: "clearReauthError",
            },
            REAUTH_DISMISS: {
              description: "User dismissed the reauth modal without re-authenticating.",
              target: "idle",
              actions: "rejectDeferred",
            },
          },
        },

        reauthing: {
          description: "Attempting login with the password the user just entered.",
          invoke: {
            src: "performReauth",
            input: ({ context, event }) => ({
              email: context.session!.email,
              password: (event as { type: "REAUTH_SUBMIT"; password: string }).password,
            }),
            onDone: {
              target: "idle",
              actions: ["updateSessionFromReauth", "persistKeychain", "resolveDeferred"],
            },
            onError: {
              target: "awaitingReauth",
              actions: "setReauthError",
            },
          },
        },
      },
    },

    loggingOut: {
      description: "Deleting credentials from the OS keychain before returning to logged out.",
      invoke: {
        src: "deleteKeychain",
        onDone: {
          target: "loggedOut",
          actions: ["clearSession", "clearUserProfile"],
        },
        onError: {
          target: "loggedOut",
          actions: ["clearSession", "clearUserProfile"],
        },
      },
    },
  },
});
