import { create } from "zustand";
import type { UserProfile } from "../types";

export interface SyncProgress {
  fetched: number;
  total: number;
}

interface SessionState {
  userProfile: UserProfile | null;
  isSyncing: boolean;
  syncProgress: SyncProgress | null;

  setUserProfile: (profile: UserProfile | null) => void;
  setIsSyncing: (syncing: boolean) => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  userProfile: null,
  isSyncing: false,
  syncProgress: null,

  setUserProfile: (profile) => set({ userProfile: profile }),
  setIsSyncing: (syncing) => set({ isSyncing: syncing, ...(!syncing ? { syncProgress: null } : {}) }),
  setSyncProgress: (progress) => set({ syncProgress: progress }),
}));
