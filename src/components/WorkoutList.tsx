import { useState, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import { useSessionStore } from "../stores/sessionStore";
import WorkoutToolbar from "./WorkoutToolbar";
import WorkoutCard from "./WorkoutCard";
import WorkoutDetail from "./WorkoutDetail";
import type { Workout } from "../types";

type SortableColumn = "date" | "title" | "instructor" | "discipline" | "duration_seconds";

const COLUMNS: { key: SortableColumn; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "title", label: "Title" },
  { key: "instructor", label: "Instructor" },
  { key: "discipline", label: "Discipline" },
  { key: "duration_seconds", label: "Duration" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

/** Sortable, filterable table of all imported workouts. */
export default function WorkoutList() {
  const { workouts, selectedWorkoutId, filters, setWorkouts, selectWorkout, setSort, isLoading, setLoading } = useWorkoutStore();
  const accessToken = useSessionStore((s) => s.session?.accessToken ?? null);
  const [viewMode, setViewMode] = useState<"table" | "detail">("table");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const cardScrollRef = useRef<HTMLDivElement>(null);

  const tableVirtualizer = useVirtualizer({
    count: workouts.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 37,
    overscan: 10,
  });

  const cardVirtualizer = useVirtualizer({
    count: workouts.length,
    getScrollElement: () => cardScrollRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  const loadWorkouts = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await queryWorkouts(filters);
      setWorkouts(rows);
    } catch (e) {
      console.error("Failed to load workouts:", e);
    } finally {
      setLoading(false);
    }
  }, [filters, setWorkouts, setLoading]);

  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  // Auto-select first workout when switching to detail view with no selection
  useEffect(() => {
    if (viewMode === "detail" && !selectedWorkoutId && workouts.length > 0) {
      selectWorkout(workouts[0].id);
    }
  }, [viewMode, selectedWorkoutId, workouts, selectWorkout]);

  const handleSort = (col: SortableColumn) => {
    if (filters.sort.field === col) {
      setSort({ field: col, direction: filters.sort.direction === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field: col, direction: col === "date" ? "desc" : "asc" });
    }
  };

  const sortIndicator = (col: SortableColumn) => {
    if (filters.sort.field !== col) return "";
    return filters.sort.direction === "asc" ? " ▲" : " ▼";
  };

  const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId) ?? null;

  const tableVirtualItems = tableVirtualizer.getVirtualItems();
  const tablePaddingTop = tableVirtualItems.length > 0 ? tableVirtualItems[0].start : 0;
  const tablePaddingBottom =
    tableVirtualItems.length > 0
      ? tableVirtualizer.getTotalSize() - tableVirtualItems[tableVirtualItems.length - 1].end
      : 0;

  const cardVirtualItems = cardVirtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full">
      <WorkoutToolbar viewMode={viewMode} onViewModeChange={setViewMode} />

      {viewMode === "table" ? (
        <div ref={tableScrollRef} className="flex-1 overflow-auto min-h-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="cursor-pointer select-none px-4 py-2 text-left text-sm font-medium text-gray-500 hover:text-gray-900"
                  >
                    {label}{sortIndicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-2 text-sm text-gray-400" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : workouts.length === 0 ? (
                <tr>
                  <td className="px-4 py-2 text-sm text-gray-400" colSpan={5}>
                    No workouts yet. Sync with the Peloton API to get started.
                  </td>
                </tr>
              ) : (
                <>
                  {tablePaddingTop > 0 && (
                    <tr>
                      <td style={{ height: tablePaddingTop, padding: 0, border: "none" }} colSpan={5} />
                    </tr>
                  )}
                  {tableVirtualItems.map((virtualRow) => {
                    const w: Workout = workouts[virtualRow.index];
                    return (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-2 text-sm">{formatDate(w.date)}</td>
                        <td className="px-4 py-2 text-sm">{w.title}</td>
                        <td className="px-4 py-2 text-sm">{w.instructor ?? "—"}</td>
                        <td className="px-4 py-2 text-sm capitalize">{w.discipline}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-sm">{formatDuration(w.duration_seconds)}</td>
                      </tr>
                    );
                  })}
                  {tablePaddingBottom > 0 && (
                    <tr>
                      <td style={{ height: tablePaddingBottom, padding: 0, border: "none" }} colSpan={5} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
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
      )}
    </div>
  );
}
