import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface Session {
  userId: string;
  accessToken: string;
}

interface SessionState {
  session: Session | null;
  loaded: boolean;

  loadFromKeychain: () => Promise<void>;
  login: (session: Session) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  loaded: false,

  loadFromKeychain: async () => {
    try {
      const creds = await invoke("load_credentials");
      if (creds) {
        const { user_id, access_token } = creds as { user_id: string; access_token: string };
        set({ session: { userId: user_id, accessToken: access_token }, loaded: true });
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
    await invoke("save_credentials", { userId: session.userId, accessToken: session.accessToken });
  },

  logout: async () => {
    await invoke("delete_credentials").catch((e) => console.error("Failed to delete credentials:", e));
    set({ session: null });
  },
}));
