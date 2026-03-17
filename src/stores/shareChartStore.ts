import { create } from "zustand";
import type { ShareChartSettings } from "../types";
import { getSetting, setSetting } from "../lib/database";

const SETTINGS_KEY = "share_chart_settings";

const DEFAULT_SETTINGS: ShareChartSettings = {
  overlays: {
    output: true,
    heartRate: false,
    cadence: false,
    resistance: false,
    speed: false,
  },
  overlayColors: {
    output: "#ee4444",
    heartRate: "#e91e63",
    cadence: "#2196f3",
    resistance: "#4caf50",
    speed: "#ff9800",
  },
  cueColor: "#333333",
  zoneBands: "pz-only",
  showInstructorCues: true,
  showHeader: true,
  showUsername: false,
  customUsername: "",
  showYAxis: true,
  stats: {
    avgPower: true,
    totalOutput: true,
    calories: true,
    distance: true,
    avgCadence: true,
    avgResistance: true,
    avgSpeed: true,
    avgHR: true,
    striveScore: true,
    ftp: true,
  },
};

function deepMerge(defaults: ShareChartSettings, partial: Partial<ShareChartSettings>): ShareChartSettings {
  return {
    overlays: { ...defaults.overlays, ...partial.overlays },
    overlayColors: { ...defaults.overlayColors, ...partial.overlayColors },
    cueColor: partial.cueColor ?? defaults.cueColor,
    zoneBands: partial.zoneBands ?? defaults.zoneBands,
    showInstructorCues: partial.showInstructorCues ?? defaults.showInstructorCues,
    showHeader: partial.showHeader ?? defaults.showHeader,
    showUsername: partial.showUsername ?? defaults.showUsername,
    customUsername: partial.customUsername ?? defaults.customUsername,
    showYAxis: partial.showYAxis ?? defaults.showYAxis,
    stats: { ...defaults.stats, ...partial.stats },
  };
}

interface ShareChartState {
  settings: ShareChartSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<ShareChartSettings>) => void;
  updateOverlay: (key: keyof ShareChartSettings["overlays"], value: boolean) => void;
  updateOverlayColor: (key: keyof ShareChartSettings["overlayColors"], value: string) => void;
  updateStat: (key: keyof ShareChartSettings["stats"], value: boolean) => void;
}

export const useShareChartStore = create<ShareChartState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const raw = await getSetting(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ShareChartSettings>;
        set({ settings: deepMerge(DEFAULT_SETTINGS, parsed), loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.error("Failed to load share chart settings:", e);
      set({ loaded: true });
    }
  },

  update: (patch) => {
    const current = get().settings;
    const next = deepMerge(current, patch);
    set({ settings: next });
    setSetting(SETTINGS_KEY, JSON.stringify(next)).catch((e) =>
      console.error("Failed to save share chart settings:", e),
    );
  },

  updateOverlay: (key, value) => {
    const { settings, update } = get();
    update({ overlays: { ...settings.overlays, [key]: value } });
  },

  updateOverlayColor: (key, value) => {
    const { settings, update } = get();
    update({ overlayColors: { ...settings.overlayColors, [key]: value } });
  },

  updateStat: (key, value) => {
    const { settings, update } = get();
    update({ stats: { ...settings.stats, [key]: value } });
  },
}));

/** Resolve the display name to show on exported charts. */
export function resolveDisplayName(settings: ShareChartSettings, pelotonUsername: string | null): string | null {
  if (!settings.showUsername) return null;
  if (settings.customUsername.trim()) return settings.customUsername.trim();
  return pelotonUsername;
}
