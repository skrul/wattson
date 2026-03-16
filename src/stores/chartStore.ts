import { create } from "zustand";
import type { ChartDefinition, FilterCondition } from "../types";
import {
  getAllChartDefinitions,
  saveChartDefinition,
  deleteChartDefinition,
} from "../lib/database";

type ChartView = "list" | "builder" | "viewer";

interface ChartState {
  view: ChartView;
  charts: ChartDefinition[];
  activeChart: ChartDefinition | null;
  draft: ChartDefinition | null;

  loadCharts: () => Promise<void>;
  createNew: () => void;
  editChart: (chart: ChartDefinition) => void;
  viewChart: (chart: ChartDefinition) => void;
  updateDraft: (updates: Partial<ChartDefinition>) => void;
  updateDraftFilter: (id: string, updates: Partial<FilterCondition>) => void;
  addDraftFilter: (condition: FilterCondition) => void;
  removeDraftFilter: (id: string) => void;
  saveDraft: () => Promise<void>;
  removeChart: (id: string) => Promise<void>;
  customizeTemplate: (template: ChartDefinition, viewerFilters: FilterCondition[]) => void;
  backToList: () => void;
}

function makeEmptyDraft(): ChartDefinition {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "",
    mark_type: "line",
    y_fields: [],
    group_by: null,
    filters: [],
    x_axis_mode: "date",
    created_at: now,
    updated_at: now,
  };
}

export const useChartStore = create<ChartState>((set, get) => ({
  view: "list",
  charts: [],
  activeChart: null,
  draft: null,

  loadCharts: async () => {
    const charts = await getAllChartDefinitions();
    set({ charts });
  },

  createNew: () => {
    set({ view: "builder", draft: makeEmptyDraft(), activeChart: null });
  },

  editChart: (chart) => {
    set({ view: "builder", draft: { ...chart }, activeChart: chart });
  },

  viewChart: (chart) => {
    set({ view: "viewer", activeChart: chart });
  },

  updateDraft: (updates) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, ...updates } });
  },

  updateDraftFilter: (id, updates) => {
    const { draft } = get();
    if (!draft) return;
    set({
      draft: {
        ...draft,
        filters: draft.filters.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        ),
      },
    });
  },

  addDraftFilter: (condition) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, filters: [...draft.filters, condition] } });
  },

  removeDraftFilter: (id) => {
    const { draft } = get();
    if (!draft) return;
    set({
      draft: {
        ...draft,
        filters: draft.filters.filter((c) => c.id !== id),
      },
    });
  },

  saveDraft: async () => {
    const { draft } = get();
    if (!draft) return;
    const saved = { ...draft, updated_at: Date.now() };
    await saveChartDefinition(saved);
    const charts = await getAllChartDefinitions();
    set({ charts, view: "viewer", activeChart: saved, draft: null });
  },

  removeChart: async (id) => {
    await deleteChartDefinition(id);
    const charts = await getAllChartDefinitions();
    set({ charts, view: "list", activeChart: null });
  },

  customizeTemplate: (template, viewerFilters) => {
    const now = Date.now();
    const draft: ChartDefinition = {
      ...template,
      id: crypto.randomUUID(),
      name: template.name,
      filters: [...viewerFilters],
      created_at: now,
      updated_at: now,
    };
    set({ view: "builder", draft, activeChart: null });
  },

  backToList: () => {
    set({ view: "list", activeChart: null, draft: null });
  },
}));
