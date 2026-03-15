import { useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { queryWorkouts } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import WorkoutToolbar from "./WorkoutToolbar";
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
  const { workouts, filters, setWorkouts, setSort, isLoading, setLoading } = useWorkoutStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: workouts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 37,
    overscan: 10,
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

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="flex flex-col h-full">
      <WorkoutToolbar />
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
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
                {paddingTop > 0 && (
                  <tr>
                    <td style={{ height: paddingTop, padding: 0, border: "none" }} colSpan={5} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
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
                {paddingBottom > 0 && (
                  <tr>
                    <td style={{ height: paddingBottom, padding: 0, border: "none" }} colSpan={5} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
