import { create } from "zustand";

export interface AnalyzeOverlays {
  output: boolean;
  heartRate: boolean;
  cadence: boolean;
  resistance: boolean;
  speed: boolean;
}

interface AnalyzeState {
  overlays: AnalyzeOverlays;
  showZoneBands: boolean;
  showInstructorCues: boolean;
  showHrZones: boolean;
  showSongs: boolean;
  /** Whether the user has manually toggled any setting yet. */
  initialized: boolean;

  toggleOverlay: (key: keyof AnalyzeOverlays) => void;
  setShowZoneBands: (v: boolean) => void;
  setShowInstructorCues: (v: boolean) => void;
  setShowHrZones: (v: boolean) => void;
  setShowSongs: (v: boolean) => void;
  /** Set sensible defaults on first mount (before user has toggled anything). */
  initDefaults: (isPZ: boolean, hasFtp: boolean) => void;
}

export const useAnalyzeStore = create<AnalyzeState>((set) => ({
  overlays: {
    output: true,
    heartRate: true,
    cadence: false,
    resistance: false,
    speed: false,
  },
  showZoneBands: false,
  showInstructorCues: false,
  showHrZones: false,
  showSongs: true,
  initialized: false,

  toggleOverlay: (key) =>
    set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] }, initialized: true })),

  setShowZoneBands: (v) => set({ showZoneBands: v, initialized: true }),
  setShowInstructorCues: (v) => set({ showInstructorCues: v, initialized: true }),
  setShowHrZones: (v) => set({ showHrZones: v, initialized: true }),
  setShowSongs: (v) => set({ showSongs: v, initialized: true }),

  initDefaults: (isPZ, hasFtp) =>
    set((s) => {
      if (s.initialized) return s;
      return {
        showZoneBands: isPZ && hasFtp,
        showInstructorCues: isPZ && hasFtp,
        initialized: true,
      };
    }),
}));
