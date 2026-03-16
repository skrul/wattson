import { useState, useEffect, useMemo } from "react";
import type { Workout } from "../types";
import { fetchWorkoutDetail, fetchPerformanceGraph, fetchRideDetails } from "../lib/api";
import { updateWorkoutMetrics, updateRideDetails, getWorkoutsByRideId } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";
import RideDetailChart from "./RideDetailChart";
import CompareTab from "./CompareTab";

type DetailTab = "summary" | "share" | "compare";

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

/** Extract FTP from workout detail's ftp_info.ftp (FTP at time of ride). */
function parseWorkoutFtp(rawDetailJson: string | null | undefined): number | null {
  if (!rawDetailJson) return null;
  try {
    const raw = JSON.parse(rawDetailJson);
    const ftp = raw?.ftp_info?.ftp;
    return typeof ftp === "number" ? ftp : null;
  } catch {
    return null;
  }
}

/** Detail view for a single workout with stats. */
export default function WorkoutDetail({ workout, accessToken }: WorkoutDetailProps) {
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [sameClassWorkouts, setSameClassWorkouts] = useState<Workout[]>([]);

  const ftp = useMemo(() => parseWorkoutFtp(workout?.raw_detail_json), [workout?.raw_detail_json]);

  // Reset tab when workout changes
  useEffect(() => {
    setActiveTab("summary");
  }, [workout?.id]);

  // Query for other attempts at the same class (by Peloton ride ID)
  useEffect(() => {
    if (!workout?.ride_id) {
      setSameClassWorkouts([]);
      return;
    }

    let cancelled = false;
    getWorkoutsByRideId(workout.ride_id).then((results) => {
      if (!cancelled) setSameClassWorkouts(results);
    }).catch(() => {
      if (!cancelled) setSameClassWorkouts([]);
    });

    return () => { cancelled = true; };
  }, [workout?.ride_id]);

  // Fetch metrics on workout select (existing logic)
  useEffect(() => {
    if (!workout || !accessToken) return;

    const needsMetrics = workout.calories == null || workout.raw_performance_graph_json == null;
    const needsRideDetails = workout.raw_ride_details_json == null;

    if (!needsMetrics && !needsRideDetails) return;

    let cancelled = false;
    if (needsMetrics) {
      setLoadingMetrics(true);
      setMetricsError(null);
    }

    // Extract ride ID from raw workout JSON
    let rideId: string | null = null;
    if (needsRideDetails && workout.raw_json) {
      try {
        rideId = JSON.parse(workout.raw_json).ride?.id ?? null;
      } catch {
        rideId = null;
      }
    }

    const detailPromise = needsMetrics
      ? fetchWorkoutDetail(workout.id, accessToken).catch((err) => {
          console.warn("Failed to fetch workout detail (non-fatal):", err);
          return null;
        })
      : Promise.resolve(null);

    const perfPromise = needsMetrics
      ? fetchPerformanceGraph(workout.id, accessToken)
      : Promise.resolve(null);

    const ridePromise = rideId
      ? fetchRideDetails(rideId, accessToken).catch((err) => {
          console.warn("Failed to fetch ride details (non-fatal):", err);
          return null;
        })
      : Promise.resolve(null);

    Promise.all([detailPromise, perfPromise, ridePromise])
      .then(async ([rawDetailJson, perfResult, rawRideDetailsJson]) => {
        if (cancelled) return;

        if (needsMetrics && perfResult) {
          const { rawJson: rawPerfJson, ...metrics } = perfResult;
          await updateWorkoutMetrics(workout.id, metrics, rawDetailJson, rawPerfJson);
          updateWorkout(workout.id, {
            ...metrics,
            raw_detail_json: rawDetailJson,
            raw_performance_graph_json: rawPerfJson,
          });
        }

        if (rawRideDetailsJson) {
          await updateRideDetails(workout.id, rawRideDetailsJson);
          updateWorkout(workout.id, { raw_ride_details_json: rawRideDetailsJson });
        }
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
  const hasShareContent = workout.discipline === "cycling" && workout.raw_performance_graph_json;
  const hasCompare = sameClassWorkouts.length >= 2;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "summary", label: "Summary" },
    ...(hasShareContent ? [{ key: "share" as DetailTab, label: "Share" }] : []),
    ...(hasCompare ? [{ key: "compare" as DetailTab, label: `Compare (${sameClassWorkouts.length})` }] : []),
  ];

  // If active tab is no longer available, fall back to summary
  const currentTab = tabs.some((t) => t.key === activeTab) ? activeTab : "summary";

  return (
    <div className="max-w-2xl">
      {/* Tab bar */}
      {tabs.length > 1 && (
        <nav className="mb-4 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                currentTab === tab.key
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {metricsError && (
        <p className="mb-4 text-sm text-red-500">{metricsError}</p>
      )}

      {/* Tab content */}
      {currentTab === "summary" && (
        <>
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
            Duration: {workout.duration_seconds != null ? formatDuration(workout.duration_seconds) : "—"}
          </p>
        </div>

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
        </>
      )}

      {currentTab === "share" && hasShareContent && (
        <RideDetailChart workout={workout} ftp={ftp} />
      )}

      {currentTab === "compare" && hasCompare && (
        <CompareTab workouts={sameClassWorkouts} currentId={workout.id} accessToken={accessToken} />
      )}
    </div>
  );
}
