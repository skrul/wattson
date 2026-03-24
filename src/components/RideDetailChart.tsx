import { useMemo, useState, useEffect } from "react";
import type { Workout } from "../types";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, isPowerZoneRide } from "../lib/charts";
import { resolveBackgroundImageSrc } from "../lib/exportUtils";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ExportButton from "./ExportButton";
import ChartCard from "./ChartCard";

interface RideDetailChartProps {
  workout: Workout;
  ftp: number | null;
}

export default function RideDetailChart({ workout, ftp }: RideDetailChartProps) {
  const styles = useShareChartStore((s) => s.styles);
  const activeStyleId = useShareChartStore((s) => s.activeStyleId);
  const userProfile = useSessionStore((s) => s.userProfile);

  const [selectedStyleId, setSelectedStyleId] = useState(activeStyleId);

  // Sync when activeStyleId changes externally (e.g. edited in Studio)
  useEffect(() => {
    setSelectedStyleId(activeStyleId);
  }, [activeStyleId]);

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === selectedStyleId) ?? styles[0],
    [styles, selectedStyleId],
  );
  const settings = selectedStyle.settings;

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

  const isPZ = isPowerZoneRide(workout);

  const backgroundImageSrc = useMemo(
    () => resolveBackgroundImageSrc(settings, workout.raw_ride_details_json),
    [settings, workout.raw_ride_details_json],
  );

  if (!timeSeries) return null;

  const filename = `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Shareable Chart</h3>
          {styles.length > 1 && (
            <select
              value={selectedStyleId}
              onChange={(e) => setSelectedStyleId(e.target.value)}
              className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <ExportButton
          filename={filename}
          workout={workout}
          ftp={ftp}
          timeSeries={timeSeries}
          cues={cues}
          displayName={displayName}
          settings={settings}
          backgroundImageSrc={backgroundImageSrc}
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
        backgroundImageSrc={backgroundImageSrc}
      />
    </div>
  );
}
