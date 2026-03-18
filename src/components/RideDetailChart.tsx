import { useMemo } from "react";
import type { Workout } from "../types";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset } from "../lib/charts";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ExportButton from "./ExportButton";
import ChartCard from "./ChartCard";

interface RideDetailChartProps {
  workout: Workout;
  ftp: number | null;
}

export default function RideDetailChart({ workout, ftp }: RideDetailChartProps) {
  const settings = useShareChartStore((s) => s.settings);
  const userProfile = useSessionStore((s) => s.userProfile);

  const pelotonUsername = useMemo(() => {
    if (!userProfile?.raw_json) return null;
    try { return (JSON.parse(userProfile.raw_json).username as string) ?? null; } catch { return null; }
  }, [userProfile?.raw_json]);

  const displayName = resolveDisplayName(settings, pelotonUsername);

  const timeSeries = useMemo(() => {
    if (!workout.raw_performance_graph_json) return null;
    return parsePerformanceGraph(workout.raw_performance_graph_json);
  }, [workout.raw_performance_graph_json]);

  const cues = useMemo(() => {
    if (!workout.raw_performance_graph_json) return null;
    const offset = parsePedalingStartOffset(workout.raw_ride_details_json);
    return parseTargetMetrics(workout.raw_performance_graph_json, offset);
  }, [workout.raw_performance_graph_json, workout.raw_ride_details_json]);

  const isPZ = workout.class_type === "Power Zone";

  if (!timeSeries) return null;

  const filename = `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Shareable Chart</h3>
        <ExportButton
          filename={filename}
          workout={workout}
          ftp={ftp}
          timeSeries={timeSeries}
          cues={cues}
          displayName={displayName}
        />
      </div>

      <ChartCard
        workout={workout}
        ftp={ftp}
        timeSeries={timeSeries}
        cues={cues}
        settings={settings}
        displayName={displayName}
        isPZ={isPZ}
      />
    </div>
  );
}
