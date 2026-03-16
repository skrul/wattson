import { useState, useEffect } from "react";
import type { Workout } from "../types";
import { AuthError, fetchPerformanceGraph } from "../lib/api";
import { updateWorkoutMetrics } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";

interface CompareTabProps {
  workouts: Workout[];
  currentId: string;
  accessToken: string | null;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MetricCell({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold">{value ?? "—"}</span>
      <span className="text-xs text-gray-500">{label}{unit ? ` (${unit})` : ""}</span>
    </div>
  );
}

export default function CompareTab({ workouts, currentId, accessToken }: CompareTabProps) {
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number } | null>(null);

  // Fetch performance data for attempts that are missing it
  useEffect(() => {
    if (!accessToken) return;

    const missing = workouts.filter((w) => w.raw_performance_graph_json == null);
    if (missing.length === 0) return;

    let cancelled = false;
    setFetchProgress({ done: 0, total: missing.length });

    (async () => {
      let done = 0;
      for (const w of missing) {
        if (cancelled) break;
        setFetchingIds(new Set([w.id]));
        try {
          const perfResult = await fetchPerformanceGraph(w.id, accessToken);
          if (cancelled) break;

          const { rawJson: rawPerfJson, ...metrics } = perfResult;
          await updateWorkoutMetrics(w.id, metrics, null, rawPerfJson);
          updateWorkout(w.id, {
            ...metrics,
            raw_performance_graph_json: rawPerfJson,
          });
        } catch (e) {
          if (e instanceof AuthError) break;
          // Other errors: skip this workout, continue
        }
        done++;
        if (!cancelled) setFetchProgress({ done, total: missing.length });

        // Rate limit: match enrichment store's 2s delay
        if (!cancelled) await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) {
        setFetchingIds(new Set());
        setFetchProgress(null);
      }
    })();

    return () => { cancelled = true; };
  }, [workouts.map((w) => w.id).join(","), accessToken]);

  const sorted = [...workouts].sort((a, b) => b.date - a.date);

  return (
    <div className="flex flex-col gap-3">
      {fetchProgress && (
        <div className="text-sm text-gray-500">
          Loading ride details ({fetchProgress.done}/{fetchProgress.total})...
        </div>
      )}
      {sorted.map((w) => {
        const isCurrent = w.id === currentId;
        return (
          <div
            key={w.id}
            className={`rounded-lg border p-4 ${
              isCurrent
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">{formatDate(w.date)}</span>
              {isCurrent && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  Current
                </span>
              )}
              {fetchingIds.has(w.id) && (
                <span className="text-xs text-gray-400">Loading details...</span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-4">
              <MetricCell label="Output" value={w.total_work != null ? Math.round(w.total_work / 1000) : null} unit="kj" />
              <MetricCell label="Calories" value={w.calories} unit="kcal" />
              <MetricCell label="Distance" value={w.distance != null ? w.distance.toFixed(2) : null} unit="mi" />
              <MetricCell label="Avg HR" value={w.avg_heart_rate} unit="bpm" />
              <MetricCell label="Strive" value={w.strive_score != null ? w.strive_score.toFixed(1) : null} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
