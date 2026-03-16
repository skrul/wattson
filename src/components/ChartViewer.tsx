import { useState, useEffect, useCallback } from "react";
import { useChartStore } from "../stores/chartStore";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../lib/database";
import type { Workout } from "../types";
import ChartPlot from "./ChartPlot";
import ChartExportButton from "./ChartExportButton";

export default function ChartViewer() {
  const { activeChart, backToList, editChart } = useChartStore();
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  const fetchData = useCallback(async () => {
    if (!activeChart) return;
    const filters = chartFiltersToWorkoutFilters(activeChart.filters);
    const data = await queryWorkouts(filters);
    setWorkouts(data);
  }, [activeChart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!activeChart) return null;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={backToList}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 4L6 8l4 4" />
            </svg>
            Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{activeChart.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ChartExportButton chart={activeChart} workouts={workouts} />
          <button
            onClick={() => editChart(activeChart)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Full-width chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ChartPlot chart={activeChart} workouts={workouts} height={500} />
      </div>

      <p className="mt-2 text-xs text-gray-400">
        {workouts.length} workout{workouts.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
