import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { DashboardState } from "./dashboardStore";
import { createDashboardStoreById } from "./dashboardStore";
import {
  getAllDashboards,
  createDashboard,
  deleteDashboard as dbDeleteDashboard,
  renameDashboard as dbRenameDashboard,
  getSetting,
  setSetting,
  saveDashboardWidgets,
} from "../lib/database";
import { buildDefaultInsightsWidgets } from "../lib/dashboardDefaults";
import { useNavigationStore, isDashboardTab, makeDashboardTab, dashboardTabId } from "./navigationStore";

export type DashboardStore = UseBoundStore<StoreApi<DashboardState>>;

export interface DashboardMeta {
  id: string;
  name: string;
  default_key: string | null;
}

interface DashboardRegistryState {
  dashboards: DashboardMeta[];
  loaded: boolean;

  loadRegistry: () => Promise<void>;
  addDashboard: (name: string) => Promise<void>;
  removeDashboard: (id: string) => Promise<void>;
  renameDashboard: (id: string, name: string) => Promise<void>;
  reorderDashboards: (ids: string[]) => Promise<void>;
  resetDashboard: (id: string) => Promise<void>;
}

const storeCache = new Map<string, DashboardStore>();

function getDashboardStore(id: string): DashboardStore {
  let store = storeCache.get(id);
  if (!store) {
    store = createDashboardStoreById(id);
    storeCache.set(id, store);
  }
  return store;
}

async function persistOrder(dashboards: DashboardMeta[]) {
  await setSetting("dashboard_order", JSON.stringify(dashboards.map((d) => d.id)));
}

export const useDashboardRegistryStore = create<DashboardRegistryState>((set, get) => ({
  dashboards: [],
  loaded: false,

  loadRegistry: async () => {
    let allDashboards = await getAllDashboards();

    // Create defaults if empty
    if (allDashboards.length === 0) {
      const dash = await createDashboard("Home", "home");
      const insights = await createDashboard("Insights", "insights");
      // Auto-populate insights with default widgets
      const defaultWidgets = buildDefaultInsightsWidgets();
      await saveDashboardWidgets(insights.id, defaultWidgets);
      allDashboards = [
        { id: dash.id, name: dash.name, default_key: "home", created_at: dash.created_at, updated_at: dash.updated_at },
        { id: insights.id, name: insights.name, default_key: "insights", created_at: insights.created_at, updated_at: insights.updated_at },
      ];
    }

    // Read saved order
    const orderJson = await getSetting("dashboard_order");
    let orderedIds: string[] | null = null;
    if (orderJson) {
      try {
        orderedIds = JSON.parse(orderJson);
      } catch { /* ignore */ }
    }

    let dashboards: DashboardMeta[];
    if (orderedIds) {
      const byId = new Map(allDashboards.map((d) => [d.id, { id: d.id, name: d.name, default_key: d.default_key }]));
      dashboards = orderedIds
        .filter((id) => byId.has(id))
        .map((id) => byId.get(id)!);
      // Append any dashboards not in the saved order
      for (const d of allDashboards) {
        if (!orderedIds.includes(d.id)) {
          dashboards.push({ id: d.id, name: d.name, default_key: d.default_key });
        }
      }
    } else {
      dashboards = allDashboards.map((d) => ({ id: d.id, name: d.name, default_key: d.default_key }));
    }

    set({ dashboards, loaded: true });
  },

  addDashboard: async (name) => {
    const dashboard = await createDashboard(name);
    const dashboards = [...get().dashboards, { id: dashboard.id, name: dashboard.name, default_key: null }];
    set({ dashboards });
    await persistOrder(dashboards);
  },

  removeDashboard: async (id) => {
    await dbDeleteDashboard(id);
    storeCache.delete(id);
    const dashboards = get().dashboards.filter((d) => d.id !== id);
    set({ dashboards });
    await persistOrder(dashboards);

    // Navigate away if the deleted dashboard was active
    const { activeTab, setActiveTab } = useNavigationStore.getState();
    if (isDashboardTab(activeTab) && dashboardTabId(activeTab) === id) {
      setActiveTab(dashboards.length > 0 ? makeDashboardTab(dashboards[0].id) : "workouts");
    }
  },

  renameDashboard: async (id, name) => {
    await dbRenameDashboard(id, name);
    const dashboards = get().dashboards.map((d) => (d.id === id ? { ...d, name } : d));
    set({ dashboards });
  },

  reorderDashboards: async (ids) => {
    const byId = new Map(get().dashboards.map((d) => [d.id, d]));
    const dashboards = ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
    set({ dashboards });
    await persistOrder(dashboards);
  },

  resetDashboard: async (id) => {
    const dashboard = get().dashboards.find((d) => d.id === id);
    if (!dashboard?.default_key) return;

    if (dashboard.default_key === "home") {
      await saveDashboardWidgets(id, []);
    } else if (dashboard.default_key === "insights") {
      const defaultWidgets = buildDefaultInsightsWidgets();
      await saveDashboardWidgets(id, defaultWidgets);
    }

    // Clear cached store so it reloads fresh
    storeCache.delete(id);
  },
}));

/** Get (or create) a cached Zustand store for a dashboard by ID. */
export { getDashboardStore };
