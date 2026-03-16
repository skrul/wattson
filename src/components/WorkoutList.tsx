import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";
import { useNavigationStore } from "../stores/navigationStore";
import { isConditionActive } from "./FilterEditors";
import WorkoutToolbar from "./WorkoutToolbar";
import WorkoutCard from "./WorkoutCard";
import WorkoutDetail from "./WorkoutDetail";
import type { Workout } from "../types";

/** Filterable list of all imported workouts with detail panel. */
export default function WorkoutList() {
  const { workouts, selectedWorkoutId, filters, setWorkouts, selectWorkout, isLoading, setLoading } = useWorkoutStore();
  const accessToken = useSessionStore((s) => s.session?.accessToken ?? null);
  const cardScrollRef = useRef<HTMLDivElement>(null);

  const cardVirtualizer = useVirtualizer({
    count: workouts.length,
    getScrollElement: () => cardScrollRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  // Stable key that only changes when query-affecting filter state changes.
  // Adding an incomplete filter (no value yet) won't trigger a re-query.
  const effectiveFilterKey = useMemo(() => {
    const active = filters.conditions.filter(isConditionActive);
    return JSON.stringify({ conditions: active, sort: filters.sort, search: filters.search });
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    const currentFilters = useWorkoutStore.getState().filters;
    setLoading(true);
    queryWorkouts(currentFilters).then((rows) => {
      if (!cancelled) {
        setWorkouts(rows);
        setLoading(false);
      }
    }).catch((e) => {
      console.error("Failed to load workouts:", e);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilterKey, setWorkouts, setLoading]);

  // Consume pending workout navigation from Insights tab
  const pendingWorkoutNav = useNavigationStore((s) => s.pendingWorkoutNav);
  useEffect(() => {
    const nav = useNavigationStore.getState().consumePendingWorkoutNav();
    if (nav) {
      const store = useWorkoutStore.getState();
      store.setFilters({
        conditions: nav.conditions,
        sort: nav.sort,
        search: "",
      });
      // Clear selection; auto-select will pick the first result after query loads
      store.selectWorkout(nav.workoutId || null);
      if (!nav.workoutId) {
        store.setWorkouts([]);
      }
    }
  }, [pendingWorkoutNav]);

  // Auto-select first workout when none is selected
  useEffect(() => {
    if (!selectedWorkoutId && workouts.length > 0) {
      selectWorkout(workouts[0].id);
    }
  }, [selectedWorkoutId, workouts, selectWorkout]);

  // Scroll virtualizer to selected workout
  useEffect(() => {
    if (!selectedWorkoutId) return;
    const idx = workouts.findIndex((w) => w.id === selectedWorkoutId);
    if (idx >= 0) {
      cardVirtualizer.scrollToIndex(idx, { align: "auto" });
    }
  }, [selectedWorkoutId, workouts, cardVirtualizer]);

  const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId) ?? null;

  const cardVirtualItems = cardVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full">
      <WorkoutToolbar />

      <div className="flex flex-1 min-h-0">
        {/* Card list */}
        <div ref={cardScrollRef} className="w-[380px] border-r overflow-auto">
          {isLoading ? (
            <p className="px-4 py-2 text-sm text-gray-400">Loading...</p>
          ) : workouts.length === 0 ? (
            <p className="px-4 py-2 text-sm text-gray-400">No workouts yet. Sync with the Peloton API to get started.</p>
          ) : (
            <div style={{ height: cardVirtualizer.getTotalSize(), position: "relative" }}>
              {cardVirtualItems.map((virtualRow) => {
                const w: Workout = workouts[virtualRow.index];
                return (
                  <div
                    key={w.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <WorkoutCard
                      workout={w}
                      isSelected={w.id === selectedWorkoutId}
                      onClick={() => selectWorkout(w.id)}
                      sortField={filters.sort.field}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-auto p-6">
          <WorkoutDetail workout={selectedWorkout} accessToken={accessToken} />
        </div>
      </div>
    </div>
  );
}
