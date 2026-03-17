import { create } from "zustand";
import type { FilterCondition, SortSpec } from "../types";

export type Tab = "workouts" | "charts" | "insights" | "profile";

interface PendingWorkoutNav {
  workoutId: string;
  conditions: FilterCondition[];
  sort: SortSpec;
}

interface NavigationState {
  activeTab: Tab;
  previousTab: Tab | null;
  pendingWorkoutNav: PendingWorkoutNav | null;

  setActiveTab: (tab: Tab) => void;
  goBack: () => void;
  navigateToWorkout: (id: string) => void;
  navigateToFilteredWorkouts: (nav: PendingWorkoutNav) => void;
  consumePendingWorkoutNav: () => PendingWorkoutNav | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeTab: "workouts",
  previousTab: null,
  pendingWorkoutNav: null,

  setActiveTab: (tab) => set({ activeTab: tab, previousTab: null }),

  goBack: () => {
    const prev = get().previousTab;
    if (prev) set({ activeTab: prev, previousTab: null });
  },

  navigateToWorkout: (id) =>
    set((state) => ({
      previousTab: state.activeTab,
      activeTab: "workouts",
      pendingWorkoutNav: { workoutId: id, conditions: [], sort: { field: "date", direction: "desc" } },
    })),

  navigateToFilteredWorkouts: (nav) =>
    set((state) => ({ previousTab: state.activeTab, activeTab: "workouts", pendingWorkoutNav: nav })),

  consumePendingWorkoutNav: () => {
    const nav = get().pendingWorkoutNav;
    if (nav) set({ pendingWorkoutNav: null });
    return nav;
  },
}));
