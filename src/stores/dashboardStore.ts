import { create } from "zustand";
import type { Dashboard, DashboardWidget, WidgetType, WidgetConfig, WidgetLayout } from "../types";
import { getOrCreateDashboard, saveDashboardWidgets } from "../lib/database";
import { WIDGET_DEFAULTS } from "../lib/dashboardDefaults";

interface DashboardState {
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

/** Persist current widgets to the database (fire-and-forget). */
function persistWidgets(dashboard: Dashboard) {
  saveDashboardWidgets(dashboard.id, dashboard.widgets).catch((err) =>
    console.error("Failed to save dashboard:", err),
  );
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboard: null,
  mode: "view",
  expandedWidgetId: null,
  configuringWidgetId: null,
  addingWidgetType: null,

  loadDashboard: async () => {
    const dashboard = await getOrCreateDashboard();
    set({ dashboard });
  },

  enterEditMode: () => set({ mode: "edit" }),

  exitEditMode: () => set({ mode: "view", configuringWidgetId: null, addingWidgetType: null }),

  addWidget: (type, config) => {
    const { dashboard } = get();
    if (!dashboard) return;
    const defaults = WIDGET_DEFAULTS[type];
    const widget: DashboardWidget = {
      id: crypto.randomUUID(),
      widget_type: type,
      config,
      layout: {
        x: 0,
        y: Infinity, // place at bottom
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

  removeWidget: (id) => {
    const { dashboard } = get();
    if (!dashboard) return;
    const updated = { ...dashboard, widgets: dashboard.widgets.filter((w) => w.id !== id) };
    set({ dashboard: updated });
    persistWidgets(updated);
  },

  updateWidgetConfig: (id, config) => {
    const { dashboard } = get();
    if (!dashboard) return;
    const updated = {
      ...dashboard,
      widgets: dashboard.widgets.map((w) => (w.id === id ? { ...w, config } : w)),
    };
    set({ dashboard: updated, configuringWidgetId: null });
    persistWidgets(updated);
  },

  updateLayouts: (layouts) => {
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

  expandWidget: (id) => set({ expandedWidgetId: id }),

  startConfiguring: (id) => set({ configuringWidgetId: id }),

  startAddingWidget: (type) => set({ addingWidgetType: type }),

  cancelConfiguring: () => set({ configuringWidgetId: null, addingWidgetType: null }),
}));
