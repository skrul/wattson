import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Dashboard, DashboardWidget, WidgetType, WidgetConfig, WidgetLayout } from "../types";
import { getOrCreateDashboard, getOrCreateDashboardByName, getDashboardById, saveDashboardWidgets } from "../lib/database";
import { WIDGET_DEFAULTS } from "../lib/dashboardDefaults";

export interface DashboardState {
  dashboard: Dashboard | null;
  mode: "view" | "edit";
  expandedWidgetId: string | null;
  configuringWidgetId: string | null;
  addingWidgetType: WidgetType | null;

  loadDashboard: () => Promise<void>;
  enterEditMode: () => void;
  exitEditMode: () => void;
  addWidget: (type: WidgetType, config: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  updateWidgetConfig: (id: string, config: WidgetConfig) => void;
  updateLayouts: (layouts: Array<{ i: string } & WidgetLayout>) => void;
  expandWidget: (id: string | null) => void;
  startConfiguring: (id: string | null) => void;
  startAddingWidget: (type: WidgetType | null) => void;
  cancelConfiguring: () => void;
}

/** Compute the y position below all existing widgets. */
function bottomY(widgets: DashboardWidget[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
}

/**
 * Create a serialized persist function that ensures writes don't race.
 * Each call waits for the previous one to finish before starting.
 */
function createPersist() {
  let pending: Promise<void> = Promise.resolve();
  return (dashboard: Dashboard) => {
    pending = pending
      .then(() => saveDashboardWidgets(dashboard.id, dashboard.widgets))
      .catch(() => {});
  };
}

/** Shared store factory — both named and by-ID stores use this. */
function createStoreActions(
  set: (partial: Partial<DashboardState>) => void,
  get: () => DashboardState,
  persistWidgets: (dashboard: Dashboard) => void,
) {
  return {
    enterEditMode: () => set({ mode: "edit" }),

    exitEditMode: () => set({ mode: "view", configuringWidgetId: null, addingWidgetType: null }),

    addWidget: (type: WidgetType, config: WidgetConfig) => {
      const { dashboard } = get();
      if (!dashboard) return;
      const defaults = WIDGET_DEFAULTS[type];
      const widget: DashboardWidget = {
        id: crypto.randomUUID(),
        widget_type: type,
        config,
        layout: {
          x: 0,
          y: bottomY(dashboard.widgets),
          w: defaults.defaultW,
          h: defaults.defaultH,
          minW: defaults.minW,
          minH: defaults.minH,
        },
      };
      const updated = { ...dashboard, widgets: [...dashboard.widgets, widget] };
      set({
        dashboard: updated,
        addingWidgetType: null,
        configuringWidgetId: null,
      });
      persistWidgets(updated);
    },

    removeWidget: (id: string) => {
      const { dashboard } = get();
      if (!dashboard) return;
      const updated = { ...dashboard, widgets: dashboard.widgets.filter((w) => w.id !== id) };
      set({ dashboard: updated });
      persistWidgets(updated);
    },

    updateWidgetConfig: (id: string, config: WidgetConfig) => {
      const { dashboard } = get();
      if (!dashboard) return;
      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.map((w) => (w.id === id ? { ...w, config } : w)),
      };
      set({ dashboard: updated, configuringWidgetId: null });
      persistWidgets(updated);
    },

    updateLayouts: (layouts: Array<{ i: string } & WidgetLayout>) => {
      const { dashboard } = get();
      if (!dashboard) return;
      const layoutMap = new Map(layouts.map((l) => [l.i, l]));
      const updated = {
        ...dashboard,
        widgets: dashboard.widgets.map((w) => {
          const l = layoutMap.get(w.id);
          if (!l) return w;
          return { ...w, layout: { ...w.layout, x: l.x, y: l.y, w: l.w, h: l.h } };
        }),
      };
      set({ dashboard: updated });
      persistWidgets(updated);
    },

    expandWidget: (id: string | null) => set({ expandedWidgetId: id }),

    startConfiguring: (id: string | null) => set({ configuringWidgetId: id }),

    startAddingWidget: (type: WidgetType | null) => set({ addingWidgetType: type }),

    cancelConfiguring: () => set({ configuringWidgetId: null, addingWidgetType: null }),
  };
}

/** Create a Zustand dashboard store for a named dashboard. */
export function createDashboardStore(dashboardName: string): UseBoundStore<StoreApi<DashboardState>> {
  const persistWidgets = createPersist();
  return create<DashboardState>((set, get) => ({
    dashboard: null,
    mode: "view",
    expandedWidgetId: null,
    configuringWidgetId: null,
    addingWidgetType: null,

    loadDashboard: async () => {
      const dashboard = dashboardName === "Home"
        ? await getOrCreateDashboard()
        : await getOrCreateDashboardByName(dashboardName);
      set({ dashboard });
    },

    ...createStoreActions(set, get, persistWidgets),
  }));
}

/** Create a Zustand dashboard store that loads by ID. */
export function createDashboardStoreById(id: string): UseBoundStore<StoreApi<DashboardState>> {
  const persistWidgets = createPersist();
  return create<DashboardState>((set, get) => ({
    dashboard: null,
    mode: "view",
    expandedWidgetId: null,
    configuringWidgetId: null,
    addingWidgetType: null,

    loadDashboard: async () => {
      const dashboard = await getDashboardById(id);
      set({ dashboard });
    },

    ...createStoreActions(set, get, persistWidgets),
  }));
}
