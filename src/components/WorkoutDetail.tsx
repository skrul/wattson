import { useState, useEffect } from "react";
import type { Workout } from "../types";
import { fetchWorkoutDetail, fetchPerformanceGraph } from "../lib/api";
import { updateWorkoutMetrics } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";

interface WorkoutDetailProps {
  workout: Workout | null;
  accessToken: string | null;
}

function formatDetailDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDetailTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface StatProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  loading?: boolean;
}

function Stat({ label, value, unit, loading }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold">
        {loading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded bg-gray-200" />
        ) : (
          value ?? "—"
        )}
      </span>
      <span className="text-xs text-gray-500">
        {label}{unit ? ` (${unit})` : ""}
      </span>
    </div>
  );
}

/** Detail view for a single workout with stats. */
export default function WorkoutDetail({ workout, accessToken }: WorkoutDetailProps) {
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!workout || !accessToken) return;
    // Use calories as a proxy for "metrics already fetched"
    if (workout.calories != null) return;

    let cancelled = false;
    setLoadingMetrics(true);
    setMetricsError(null);

    Promise.all([
      fetchWorkoutDetail(workout.id, accessToken).catch((err) => {
        console.warn("Failed to fetch workout detail (non-fatal):", err);
        return null;
      }),
      fetchPerformanceGraph(workout.id, accessToken),
    ])
      .then(async ([rawDetailJson, perfResult]) => {
        if (cancelled) return;
        const { rawJson: rawPerfJson, ...metrics } = perfResult;
        await updateWorkoutMetrics(workout.id, metrics, rawDetailJson, rawPerfJson);
        updateWorkout(workout.id, {
          ...metrics,
          raw_detail_json: rawDetailJson,
          raw_performance_graph_json: rawPerfJson,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch workout metrics:", err);
        setMetricsError("Failed to load metrics");
      })
      .finally(() => {
        if (!cancelled) setLoadingMetrics(false);
      });

    return () => { cancelled = true; };
  }, [workout?.id, accessToken]);

  if (!workout) {
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-lg font-semibold">Workout Detail</h2>
        <p className="text-gray-500">Select a workout to view detailed metrics</p>
      </div>
    );
  }

  const discipline = workout.discipline.charAt(0).toUpperCase() + workout.discipline.slice(1);
  const showLoading = loadingMetrics && workout.calories == null;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          {formatDetailDate(workout.date)} at {formatDetailTime(workout.date)}
        </p>
        <h2 className="mt-1 text-xl font-bold">{discipline} Workout</h2>
        <p className="mt-1 text-sm text-gray-600">
          {workout.title}
          {workout.instructor && <> · {workout.instructor}</>}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Duration: {formatDuration(workout.duration_seconds)}
        </p>
      </div>

      {metricsError && (
        <p className="mb-4 text-sm text-red-500">{metricsError}</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-6">
        <Stat label="Total Output" value={workout.total_work != null ? Math.round(workout.total_work / 1000) : null} unit="kj" loading={showLoading} />
        <Stat label="Distance" value={workout.distance != null ? workout.distance.toFixed(2) : null} unit="mi" loading={showLoading} />
        <Stat label="Calories" value={workout.calories} unit="kcal" loading={showLoading} />

        <Stat label="Avg Output" value={workout.avg_output} unit="watts" loading={showLoading} />
        <Stat label="Avg Cadence" value={workout.avg_cadence} unit="rpm" loading={showLoading} />
        <Stat label="Avg Resistance" value={workout.avg_resistance != null ? `${workout.avg_resistance}%` : null} loading={showLoading} />

        <Stat label="Avg Speed" value={workout.avg_speed != null ? workout.avg_speed.toFixed(1) : null} unit="mph" loading={showLoading} />
        <Stat label="Avg Heart Rate" value={workout.avg_heart_rate} unit="bpm" loading={showLoading} />
        <Stat label="Strive Score" value={workout.strive_score != null ? workout.strive_score.toFixed(1) : null} />
      </div>
    </div>
  );
}
