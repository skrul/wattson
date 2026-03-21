import { create } from "zustand";
import type { FilterCondition, SortSpec, WorkoutFilters } from "../types";
import { useWorkoutStore } from "./workoutStore";

export type Tab = string;

const DASHBOARD_PREFIX = "dashboard:";

export function isDashboardTab(tab: Tab): boolean {
  return tab.startsWith(DASHBOARD_PREFIX);
}

export function dashboardTabId(tab: Tab): string {
  return tab.slice(DASHBOARD_PREFIX.length);
}

export function makeDashboardTab(id: string): Tab {
  return `${DASHBOARD_PREFIX}${id}`;
}

interface PendingWorkoutNav {
  workoutId: string;
  conditions: FilterCondition[];
  sort: SortSpec;
}

interface NavigationState {
  activeTab: Tab;
  previousTab: Tab | null;
  previousWorkoutFilters: WorkoutFilters | null;
  previousSelectedWorkoutId: string | null;
  pendingWorkoutNav: PendingWorkoutNav | null;

  setActiveTab: (tab: Tab) => void;
  goBack: () => void;
  navigateToWorkout: (id: string) => void;
  navigateToFilteredWorkouts: (nav: PendingWorkoutNav) => void;
  consumePendingWorkoutNav: () => PendingWorkoutNav | null;
}

function restorePreviousWorkoutState(state: NavigationState) {
  if (state.previousWorkoutFilters) {
    const ws = useWorkoutStore.getState();
    ws.setFilters(state.previousWorkoutFilters);
    ws.selectWorkout(state.previousSelectedWorkoutId);
  }
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeTab: "workouts", // temporary default until registry sets first dashboard tab
  previousTab: null,
  previousWorkoutFilters: null,
  previousSelectedWorkoutId: null,
  pendingWorkoutNav: null,

  setActiveTab: (tab) => {
    const state = get();
    restorePreviousWorkoutState(state);
    set({ activeTab: tab, previousTab: null, previousWorkoutFilters: null, previousSelectedWorkoutId: null });
  },

  goBack: () => {
    const state = get();
    if (!state.previousTab) return;
    restorePreviousWorkoutState(state);
    set({ activeTab: state.previousTab, previousTab: null, previousWorkoutFilters: null, previousSelectedWorkoutId: null });
  },

  navigateToWorkout: (id) =>
    set((state) => {
      const ws = useWorkoutStore.getState();
      return {
        previousTab: state.activeTab,
        activeTab: "workouts",
        previousWorkoutFilters: ws.filters,
        previousSelectedWorkoutId: ws.selectedWorkoutId,
        pendingWorkoutNav: { workoutId: id, conditions: [], sort: { field: "date", direction: "desc" } },
      };
    }),

  navigateToFilteredWorkouts: (nav) =>
    set((state) => {
      const ws = useWorkoutStore.getState();
      return {
        previousTab: state.activeTab,
        activeTab: "workouts",
        previousWorkoutFilters: ws.filters,
        previousSelectedWorkoutId: ws.selectedWorkoutId,
        pendingWorkoutNav: nav,
      };
    }),

  consumePendingWorkoutNav: () => {
    const nav = get().pendingWorkoutNav;
    if (nav) set({ pendingWorkoutNav: null });
    return nav;
  },

}));
