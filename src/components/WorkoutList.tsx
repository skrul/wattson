import { useEffect, useCallback } from "react";
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

  return (
    <div>
      <WorkoutToolbar />
      <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
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
                No workouts yet. Import a CSV or sync with the Peloton API.
              </td>
            </tr>
          ) : (
            workouts.map((w: Workout) => (
              <tr key={w.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2 text-sm">{formatDate(w.date)}</td>
                <td className="px-4 py-2 text-sm">{w.title}</td>
                <td className="px-4 py-2 text-sm">{w.instructor ?? "—"}</td>
                <td className="px-4 py-2 text-sm capitalize">{w.discipline}</td>
                <td className="whitespace-nowrap px-4 py-2 text-sm">{formatDuration(w.duration_seconds)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
