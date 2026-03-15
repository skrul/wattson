import { create } from "zustand";
import type { Workout, WorkoutFilters, FilterCondition, SortSpec } from "../types";

interface WorkoutState {
  workouts: Workout[];
  selectedWorkoutId: string | null;
  filters: WorkoutFilters;
  isLoading: boolean;

  setWorkouts: (workouts: Workout[]) => void;
  selectWorkout: (id: string | null) => void;
  setFilters: (filters: WorkoutFilters) => void;
  setLoading: (loading: boolean) => void;
  addCondition: (condition: FilterCondition) => void;
  updateCondition: (id: string, updates: Partial<FilterCondition>) => void;
  removeCondition: (id: string) => void;
  clearConditions: () => void;
  setSort: (sort: SortSpec) => void;
  clearSort: () => void;
  setSearch: (search: string) => void;
}

const DEFAULT_SORT: SortSpec = { field: "date", direction: "desc" };

export const useWorkoutStore = create<WorkoutState>((set) => ({
  workouts: [],
  selectedWorkoutId: null,
  filters: { conditions: [], sort: DEFAULT_SORT, search: "" },
  isLoading: false,

  setWorkouts: (workouts) => set({ workouts }),
  selectWorkout: (id) => set({ selectedWorkoutId: id }),
  setFilters: (filters) => set({ filters }),
  setLoading: (isLoading) => set({ isLoading }),

  addCondition: (condition) =>
    set((state) => ({
      filters: {
        ...state.filters,
        conditions: [...state.filters.conditions, condition],
      },
    })),

  updateCondition: (id, updates) =>
    set((state) => ({
      filters: {
        ...state.filters,
        conditions: state.filters.conditions.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        ),
      },
    })),

  removeCondition: (id) =>
    set((state) => ({
      filters: {
        ...state.filters,
        conditions: state.filters.conditions.filter((c) => c.id !== id),
      },
    })),

  clearConditions: () =>
    set((state) => ({
      filters: { ...state.filters, conditions: [] },
    })),

  setSort: (sort) =>
    set((state) => ({
      filters: { ...state.filters, sort },
    })),

  clearSort: () =>
    set((state) => ({
      filters: { ...state.filters, sort: DEFAULT_SORT },
    })),

  setSearch: (search) =>
    set((state) => ({
      filters: { ...state.filters, search },
    })),
}));
