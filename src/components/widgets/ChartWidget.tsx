import { useState, useEffect, useCallback, useMemo } from "react";
import type { DashboardWidget, ChartDefinition, Workout, FilterCondition } from "../../types";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../../lib/database";
import { isConditionActive } from "../FilterEditors";
import { useNavigationStore } from "../../stores/navigationStore";
import { useWorkoutStore } from "../../stores/workoutStore";
import { useEnrichmentStore } from "../../stores/enrichmentStore";
import { useDashboardContext } from "../../stores/DashboardContext";
import { DETAIL_FIELD_KEYS } from "../../lib/fields";
import ChartPlot from "../ChartPlot";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

let condId = 0;

export default function ChartWidget({ widget }: Props) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);
  const navigateToWorkout = useNavigationStore((s) => s.navigateToWorkout);
  const syncGeneration = useWorkoutStore((s) => s.syncGeneration);
  const useStore = useDashboardContext();
  const mode = useStore((s) => s.mode);
  if (widget.config.type !== "chart") return null;
  const chartConfig = widget.config.chart;

  const chart: ChartDefinition = useMemo(() => ({
    id: widget.id,
    ...chartConfig,
    created_at: 0,
    updated_at: 0,
  }), [widget.id, chartConfig]);

  const activeFiltersKey = useMemo(
    () => JSON.stringify((chartConfig.filters ?? []).filter(isConditionActive)),
    [chartConfig.filters],
  );

  const fetchData = useCallback(async () => {
    const conditions = JSON.parse(activeFiltersKey) as FilterCondition[];
    const filters = chartFiltersToWorkoutFilters(conditions);
    const data = await queryWorkouts(filters);
    setWorkouts(data);
  }, [activeFiltersKey, syncGeneration]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCategoryClick = useCallback((label: string) => {
    const field = chartConfig.x_axis_field;
    if (!field) return;
    navigateToFilteredWorkouts({
      workoutId: "",
      conditions: [{ id: `chart-${condId++}`, field, operator: "equals", value: "", values: [label] }],
      sort: { field: "date", direction: "desc" },
    });
  }, [chartConfig.x_axis_field, navigateToFilteredWorkouts]);

  const enrichmentComplete = useEnrichmentStore((s) => s.enrichmentComplete);

  // Collect all field keys this chart depends on
  const usesDetailFields = useMemo(() => {
    const keys: string[] = chartConfig.y_fields.map((f) => f.field);
    if (chartConfig.x_axis_field) keys.push(chartConfig.x_axis_field);
    if (chartConfig.group_by) keys.push(chartConfig.group_by);
    return keys.some((k) => DETAIL_FIELD_KEYS.has(k));
  }, [chartConfig.y_fields, chartConfig.x_axis_field, chartConfig.group_by]);

  // Check if all detail-dependent y-values are null across all workouts
  const detailDataMissing = useMemo(() => {
    if (!usesDetailFields || !workouts || workouts.length === 0) return false;
    const detailYFields = chartConfig.y_fields
      .map((f) => f.field)
      .filter((k) => DETAIL_FIELD_KEYS.has(k));
    if (detailYFields.length === 0) return false;
    return workouts.every((w) =>
      detailYFields.every((k) => (w as unknown as Record<string, unknown>)[k] == null),
    );
  }, [usesDetailFields, workouts, chartConfig.y_fields]);

  const handleWorkoutClick = useCallback((workoutId: string) => {
    navigateToWorkout(workoutId);
  }, [navigateToWorkout]);

  if (workouts === null) {
    return (
      <div className="flex h-full w-full flex-col">
        {chartConfig.name && (
          <div className="shrink-0 truncate text-sm font-medium text-gray-700">{chartConfig.name}</div>
        )}
        <div className="min-h-0 flex-1 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (detailDataMissing && !enrichmentComplete) {
    return (
      <div className="flex h-full w-full flex-col">
        {chartConfig.name && (
          <div className="shrink-0 truncate text-sm font-medium text-gray-700">{chartConfig.name}</div>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-gray-400">
          Waiting for workout details to download
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {chartConfig.name && (
        <div className="shrink-0 truncate text-sm font-medium text-gray-700">{chartConfig.name}</div>
      )}
      <div className="min-h-0 flex-1">
        <ChartPlot chart={chart} workouts={workouts} fillContainer onCategoryClick={mode === "view" ? handleCategoryClick : undefined} onWorkoutClick={mode === "view" ? handleWorkoutClick : undefined} />
      </div>
    </div>
  );
}
