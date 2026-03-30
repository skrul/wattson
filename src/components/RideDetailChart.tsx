import { useMemo, useState } from "react";
import type { Workout } from "../types";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, isPowerZoneRide } from "../lib/charts";
import { resolveBackgroundImageSrc } from "../lib/exportUtils";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ChartCard from "./ChartCard";
import ShareModal from "./ShareModal";

interface RideDetailChartProps {
  workout: Workout;
  ftp: number | null;
}

export default function RideDetailChart({ workout, ftp }: RideDetailChartProps) {
  const settings = useShareChartStore((s) => s.settings);
  const userProfile = useSessionStore((s) => s.userProfile);
  const [shareOpen, setShareOpen] = useState(false);

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

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Shareable Chart</h3>
        <button
          onClick={() => setShareOpen(true)}
          className="rounded bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200"
          title="Share"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8V13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V8" />
            <path d="M8 2V10" />
            <path d="M5 5L8 2L11 5" />
          </svg>
        </button>
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

      {shareOpen && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          workout={workout}
          ftp={ftp}
          timeSeries={timeSeries}
          cues={cues}
        />
      )}
    </div>
  );
}
