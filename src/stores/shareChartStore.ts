import { create } from "zustand";
import type { ShareChartSettings, ChartStyle, ChartStylesData } from "../types";
import { getSetting, setSetting } from "../lib/database";

const SETTINGS_KEY = "share_chart_settings";
const DEFAULT_STYLE_ID = "default";

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

function makeDefaultStyle(): ChartStyle {
  return { id: DEFAULT_STYLE_ID, name: "Default", settings: { ...DEFAULT_SETTINGS, overlays: { ...DEFAULT_SETTINGS.overlays }, overlayColors: { ...DEFAULT_SETTINGS.overlayColors }, stats: { ...DEFAULT_SETTINGS.stats } } };
}

function generateId(): string {
  return crypto.randomUUID();
}

function cloneSettings(s: ShareChartSettings): ShareChartSettings {
  return {
    ...s,
    overlays: { ...s.overlays },
    overlayColors: { ...s.overlayColors },
    stats: { ...s.stats },
  };
}

interface ShareChartState {
  styles: ChartStyle[];
  activeStyleId: string;
  settings: ShareChartSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<ShareChartSettings>) => void;
  updateOverlay: (key: keyof ShareChartSettings["overlays"], value: boolean) => void;
  updateOverlayColor: (key: keyof ShareChartSettings["overlayColors"], value: string) => void;
  updateStat: (key: keyof ShareChartSettings["stats"], value: boolean) => void;
  createStyle: (name: string) => string;
  duplicateStyle: (sourceId: string, name: string) => string;
  renameStyle: (id: string, name: string) => void;
  deleteStyle: (id: string) => void;
  setActiveStyle: (id: string) => void;
}

function getActiveSettings(styles: ChartStyle[], activeStyleId: string): ShareChartSettings {
  const style = styles.find((s) => s.id === activeStyleId);
  return style ? style.settings : styles[0].settings;
}

function persist(state: { styles: ChartStyle[]; activeStyleId: string }) {
  const data: ChartStylesData = {
    version: 2,
    activeStyleId: state.activeStyleId,
    styles: state.styles,
  };
  setSetting(SETTINGS_KEY, JSON.stringify(data)).catch((e) =>
    console.error("Failed to save share chart settings:", e),
  );
}

export const useShareChartStore = create<ShareChartState>((set, get) => ({
  styles: [makeDefaultStyle()],
  activeStyleId: DEFAULT_STYLE_ID,
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const raw = await getSetting(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const data = parsed as ChartStylesData;
        const styles = data.styles.map((s) => ({
          ...s,
          settings: deepMerge(DEFAULT_SETTINGS, s.settings),
        }));
        const activeStyleId = styles.find((s) => s.id === data.activeStyleId) ? data.activeStyleId : styles[0].id;
        set({ styles, activeStyleId, settings: getActiveSettings(styles, activeStyleId), loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch (e) {
      console.error("Failed to load share chart settings:", e);
      set({ loaded: true });
    }
  },

  update: (patch) => {
    const { styles, activeStyleId } = get();
    const next = styles.map((s) =>
      s.id === activeStyleId ? { ...s, settings: deepMerge(s.settings, patch) } : s,
    );
    const settings = getActiveSettings(next, activeStyleId);
    set({ styles: next, settings });
    persist({ styles: next, activeStyleId });
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

  createStyle: (name) => {
    const id = generateId();
    const newStyle: ChartStyle = { id, name, settings: cloneSettings(DEFAULT_SETTINGS) };
    const { styles } = get();
    const next = [...styles, newStyle];
    set({ styles: next, activeStyleId: id, settings: newStyle.settings });
    persist({ styles: next, activeStyleId: id });
    return id;
  },

  duplicateStyle: (sourceId, name) => {
    const { styles } = get();
    const source = styles.find((s) => s.id === sourceId);
    if (!source) return sourceId;
    const id = generateId();
    const newStyle: ChartStyle = { id, name, settings: cloneSettings(source.settings) };
    const next = [...styles, newStyle];
    set({ styles: next, activeStyleId: id, settings: newStyle.settings });
    persist({ styles: next, activeStyleId: id });
    return id;
  },

  renameStyle: (id, name) => {
    if (id === DEFAULT_STYLE_ID) return;
    const { styles, activeStyleId } = get();
    const next = styles.map((s) => (s.id === id ? { ...s, name } : s));
    set({ styles: next });
    persist({ styles: next, activeStyleId });
  },

  deleteStyle: (id) => {
    if (id === DEFAULT_STYLE_ID) return;
    const { styles, activeStyleId } = get();
    const next = styles.filter((s) => s.id !== id);
    const newActiveId = id === activeStyleId ? DEFAULT_STYLE_ID : activeStyleId;
    set({ styles: next, activeStyleId: newActiveId, settings: getActiveSettings(next, newActiveId) });
    persist({ styles: next, activeStyleId: newActiveId });
  },

  setActiveStyle: (id) => {
    const { styles } = get();
    if (!styles.find((s) => s.id === id)) return;
    set({ activeStyleId: id, settings: getActiveSettings(styles, id) });
    persist({ styles, activeStyleId: id });
  },
}));

/** Resolve the display name to show on exported charts. */
export function resolveDisplayName(settings: ShareChartSettings, pelotonUsername: string | null): string | null {
  if (!settings.showUsername) return null;
  if (settings.customUsername.trim()) return settings.customUsername.trim();
  return pelotonUsername;
}
