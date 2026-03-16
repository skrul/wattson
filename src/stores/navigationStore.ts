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
  pendingWorkoutNav: PendingWorkoutNav | null;

  setActiveTab: (tab: Tab) => void;
  navigateToWorkout: (id: string) => void;
  navigateToFilteredWorkouts: (nav: PendingWorkoutNav) => void;
  consumePendingWorkoutNav: () => PendingWorkoutNav | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeTab: "workouts",
  pendingWorkoutNav: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  navigateToWorkout: (id) =>
    set({
      activeTab: "workouts",
      pendingWorkoutNav: { workoutId: id, conditions: [], sort: { field: "date", direction: "desc" } },
    }),

  navigateToFilteredWorkouts: (nav) =>
    set({ activeTab: "workouts", pendingWorkoutNav: nav }),

  consumePendingWorkoutNav: () => {
    const nav = get().pendingWorkoutNav;
    if (nav) set({ pendingWorkoutNav: null });
    return nav;
  },
}));
