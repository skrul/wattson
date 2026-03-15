import { create } from "zustand";

interface ReauthResult {
  userId: string;
  accessToken: string;
}

interface Pending {
  email: string;
  resolve: (result: ReauthResult) => void;
  reject: (error: Error) => void;
}

interface ReauthState {
  pending: Pending | null;
  requestReauth: (email: string) => Promise<ReauthResult>;
  resolveReauth: (result: ReauthResult) => void;
  rejectReauth: (error: Error) => void;
}

export const useReauthStore = create<ReauthState>((set, get) => ({
  pending: null,

  requestReauth: (email) => {
    return new Promise<ReauthResult>((resolve, reject) => {
      set({ pending: { email, resolve, reject } });
    });
  },

  resolveReauth: (result) => {
    const { pending } = get();
    if (pending) {
      pending.resolve(result);
      set({ pending: null });
    }
  },

  rejectReauth: (error) => {
    const { pending } = get();
    if (pending) {
      pending.reject(error);
      set({ pending: null });
    }
  },
}));
