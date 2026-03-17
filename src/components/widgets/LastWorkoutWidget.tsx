import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { DashboardWidget, Workout, FilterCondition } from "../../types";
import { queryWorkouts, getDb } from "../../lib/database";
import { isConditionActive } from "../FilterEditors";
import { parsePerformanceGraph, parseInstructorCues, renderRideDetailChart } from "../../lib/charts";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function LastWorkoutWidget({ widget }: Props) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);

  if (widget.config.type !== "last_workout") return null;
  const { title, filters } = widget.config;

  const activeFiltersKey = useMemo(
    () => JSON.stringify((filters ?? []).filter(isConditionActive)),
    [filters],
  );

  const fetchWorkout = useCallback(async () => {
    setLoading(true);
    const conditions = JSON.parse(activeFiltersKey) as FilterCondition[];
    const results = await queryWorkouts({
      conditions,
      sort: { field: "date", direction: "desc" },
      search: "",
    });
    if (results.length > 0) {
      // queryWorkouts doesn't include raw JSON fields, fetch full row
      const d = await getDb();
      const rows = await d.select<Workout[]>("SELECT * FROM workouts WHERE id = $1", [results[0].id]);
      setWorkout(rows[0] ?? null);
    } else {
      setWorkout(null);
    }
    setLoading(false);
  }, [activeFiltersKey]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  const timeSeries = useMemo(() => {
    if (!workout?.raw_performance_graph_json) return null;
    return parsePerformanceGraph(workout.raw_performance_graph_json);
  }, [workout?.raw_performance_graph_json]);

  const cues = useMemo(() => {
    if (!workout?.raw_ride_details_json) return null;
    return parseInstructorCues(workout.raw_ride_details_json);
  }, [workout?.raw_ride_details_json]);

  useEffect(() => {
    if (!chartRef.current || !timeSeries || !workout) return;
    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, null, {
      width: el.clientWidth || 800,
      durationSeconds: workout.duration_seconds ?? undefined,
    }, cues);
    el.replaceChildren(chart);
    return () => { el.replaceChildren(); };
  }, [timeSeries, cues, workout]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading...</div>;
  }

  if (!workout) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No matching workouts</div>;
  }

  if (!timeSeries) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No performance data</div>;
  }

  return (
    <div className="h-full">
      {title && <div className="shrink-0 truncate text-sm font-medium text-gray-700">{title}</div>}
      <p className="mb-1 text-xs text-gray-500">
        {workout.title}{workout.instructor ? ` · ${workout.instructor}` : ""}
      </p>
      <div ref={chartRef} className="w-full" />
    </div>
  );
}
