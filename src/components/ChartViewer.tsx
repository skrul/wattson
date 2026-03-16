import { useState, useEffect, useCallback, useMemo } from "react";
import { useChartStore } from "../stores/chartStore";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../lib/database";
import { isTemplate } from "../lib/chartTemplates";
import type { Workout, FilterCondition } from "../types";
import ChartPlot from "./ChartPlot";
import ChartExportButton from "./ChartExportButton";
import { FilterBar } from "./ChartFilterBar";

export default function ChartViewer() {
  const { activeChart, backToList, editChart, customizeTemplate } = useChartStore();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  // Reset local filters when chart changes
  useEffect(() => {
    setFilters([]);
  }, [activeChart?.id]);

  // Combine chart's saved filters with local viewer filters
  const allFilters = useMemo(() => {
    if (!activeChart) return [];
    return [...activeChart.filters, ...filters];
  }, [activeChart, filters]);

  const fetchData = useCallback(async () => {
    if (!activeChart) return;
    const workoutFilters = chartFiltersToWorkoutFilters(allFilters);
    const data = await queryWorkouts(workoutFilters);
    setWorkouts(data);
  }, [activeChart, allFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddFilter = useCallback((condition: FilterCondition) => {
    setFilters((prev) => [...prev, condition]);
  }, []);

  const handleUpdateFilter = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setFilters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  }, []);

  const handleRemoveFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  if (!activeChart) return null;

  const template = isTemplate(activeChart);

  // Build a chart object with merged filters for export
  const chartForExport = {
    ...activeChart,
    filters: allFilters,
  };

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
          <ChartExportButton chart={chartForExport} workouts={workouts} />
          {template ? (
            <button
              onClick={() => customizeTemplate(activeChart, filters)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Customize
            </button>
          ) : (
            <button
              onClick={() => editChart(activeChart)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4">
        <FilterBar
          filters={filters}
          onAdd={handleAddFilter}
          onUpdate={handleUpdateFilter}
          onRemove={handleRemoveFilter}
        />
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
