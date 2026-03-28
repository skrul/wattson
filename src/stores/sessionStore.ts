import { create } from "zustand";
import type { UserProfile } from "../types";

interface SessionState {
  userProfile: UserProfile | null;

  setUserProfile: (profile: UserProfile | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userProfile: null,

  setUserProfile: (profile) => set({ userProfile: profile }),
}));
