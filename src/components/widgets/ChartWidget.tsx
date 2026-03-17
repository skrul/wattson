import { useState, useEffect, useCallback, useMemo } from "react";
import type { DashboardWidget, ChartDefinition, Workout, FilterCondition } from "../../types";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../../lib/database";
import { isConditionActive } from "../FilterEditors";
import ChartPlot from "../ChartPlot";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function ChartWidget({ widget }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
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
  }, [activeFiltersKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex h-full w-full flex-col">
      {chartConfig.name && (
        <div className="shrink-0 truncate text-sm font-medium text-gray-700">{chartConfig.name}</div>
      )}
      <div className="min-h-0 flex-1">
        <ChartPlot chart={chart} workouts={workouts} fillContainer />
      </div>
    </div>
  );
}
