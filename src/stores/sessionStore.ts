import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { UserProfile } from "../types";

interface Session {
  userId: string;
  accessToken: string;
  email: string;
  password: string;
}

interface SessionState {
  session: Session | null;
  loaded: boolean;
  userProfile: UserProfile | null;

  loadFromKeychain: () => Promise<void>;
  login: (session: Session) => Promise<void>;
  logout: () => Promise<void>;
  updateCredentials: (accessToken: string, password: string) => Promise<void>;
  setUserProfile: (profile: UserProfile | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  loaded: false,
  userProfile: null,

  loadFromKeychain: async () => {
    try {
      const creds = await invoke("load_credentials");
      if (creds) {
        const { user_id, access_token, email, password } = creds as {
          user_id: string;
          access_token: string;
          email?: string;
          password?: string;
        };
        if (!email || !password) {
          // Legacy keychain entry without email/password — force re-login
          set({ session: null, loaded: true });
        } else {
          set({ session: { userId: user_id, accessToken: access_token, email, password }, loaded: true });
        }
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.error("Failed to load credentials:", e);
      set({ loaded: true });
    }
  },

  login: async (session) => {
    set({ session });
    await invoke("save_credentials", {
      userId: session.userId,
      accessToken: session.accessToken,
      email: session.email,
      password: session.password,
    });
  },

  logout: async () => {
    await invoke("delete_credentials").catch((e) => console.error("Failed to delete credentials:", e));
    set({ session: null, userProfile: null });
  },

  updateCredentials: async (accessToken, password) => {
    const current = get().session;
    if (!current) return;
    const updated = { ...current, accessToken, password };
    set({ session: updated });
    await invoke("save_credentials", {
      userId: updated.userId,
      accessToken: updated.accessToken,
      email: updated.email,
      password: updated.password,
    });
  },

  setUserProfile: (profile) => set({ userProfile: profile }),
}));
