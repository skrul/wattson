import { create } from "zustand";
import type { Workout, WorkoutFilters } from "../types";

interface WorkoutState {
  workouts: Workout[];
  selectedWorkoutId: string | null;
  filters: WorkoutFilters;
  isLoading: boolean;

  setWorkouts: (workouts: Workout[]) => void;
  selectWorkout: (id: string | null) => void;
  setFilters: (filters: WorkoutFilters) => void;
  setLoading: (loading: boolean) => void;
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  workouts: [],
  selectedWorkoutId: null,
  filters: { sortBy: "date", sortOrder: "desc" },
  isLoading: false,

  setWorkouts: (workouts) => set({ workouts }),
  selectWorkout: (id) => set({ selectedWorkoutId: id }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setLoading: (isLoading) => set({ isLoading }),
}));
