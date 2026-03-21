import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";
import { useNavigationStore, isDashboardTab, dashboardTabId } from "../stores/navigationStore";
import { useDashboardRegistryStore } from "../stores/dashboardRegistryStore";
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
  const prevSortRef = useRef(filters.sort);
  const navSelectedRef = useRef(false);

  const cardVirtualizer = useVirtualizer({
    count: workouts.length,
    getScrollElement: () => cardScrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
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
    const sortChanged =
      prevSortRef.current.field !== currentFilters.sort.field ||
      prevSortRef.current.direction !== currentFilters.sort.direction;
    prevSortRef.current = currentFilters.sort;
    setLoading(true);
    queryWorkouts(currentFilters).then((rows) => {
      if (!cancelled) {
        // Preserve enrichment data (fetched on-demand, not in queryWorkouts SELECT)
        const oldWorkouts = useWorkoutStore.getState().workouts;
        if (oldWorkouts.length > 0) {
          const enriched = new Map<string, Workout>();
          for (const w of oldWorkouts) {
            if (w.raw_performance_graph_json != null || w.raw_detail_json != null || w.raw_ride_details_json != null) {
              enriched.set(w.id, w);
            }
          }
          if (enriched.size > 0) {
            rows = rows.map((w) => {
              const old = enriched.get(w.id);
              return old ? { ...w, raw_performance_graph_json: old.raw_performance_graph_json, raw_detail_json: old.raw_detail_json, raw_ride_details_json: old.raw_ride_details_json } : w;
            });
          }
        }
        setWorkouts(rows);
        if (sortChanged && rows.length > 0 && !navSelectedRef.current) {
          selectWorkout(rows[0].id);
        }
        navSelectedRef.current = false;
        setLoading(false);
      }
    }).catch(() => {
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
      store.selectWorkout(nav.workoutId || null);
      navSelectedRef.current = !!nav.workoutId;
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

  const previousTab = useNavigationStore((s) => s.previousTab);
  const goBack = useNavigationStore((s) => s.goBack);
  const dashboards = useDashboardRegistryStore((s) => s.dashboards);

  const backLabel = previousTab
    ? isDashboardTab(previousTab)
      ? dashboards.find((d) => d.id === dashboardTabId(previousTab))?.name ?? "Dashboard"
      : previousTab.charAt(0).toUpperCase() + previousTab.slice(1)
    : null;

  return (
    <div className="flex flex-col h-full">
      {previousTab && (
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 border-b border-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
          Back to {backLabel}
        </button>
      )}
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
                    ref={cardVirtualizer.measureElement}
                    data-index={virtualRow.index}
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
