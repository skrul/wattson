import { useRef, useEffect, useMemo } from "react";
import type { Workout } from "../types";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, renderRideDetailChart } from "../lib/charts";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ExportButton from "./ExportButton";

interface RideDetailChartProps {
  workout: Workout;
  ftp: number | null;
}

function formatChartDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface FooterStatProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}

function FooterStat({ label, value, unit }: FooterStatProps) {
  if (value == null) return null;
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-semibold">
        {value}{unit ? ` ${unit}` : ""}
      </span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

export default function RideDetailChart({ workout, ftp }: RideDetailChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!chartRef.current || !timeSeries) return;

    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, ftp || null, {
      width: el.clientWidth || 800,
      durationSeconds: workout.duration_seconds ?? undefined,
      overlays: settings.overlays,
      overlayColors: settings.overlayColors,
      cueColor: settings.cueColor,
      showZoneBands: settings.zoneBands === "always" || (settings.zoneBands === "pz-only" && isPZ),
      showInstructorCues: settings.showInstructorCues,
      showYAxis: settings.showYAxis,
    }, cues);
    el.replaceChildren(chart);

    return () => { el.replaceChildren(); };
  }, [timeSeries, ftp, cues, settings]);

  if (!timeSeries) return null;

  const filename = `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`;

  const st = settings.stats;

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

      <div className="select-none rounded-lg border border-gray-200 bg-white p-4">
        {/* Header */}
        {settings.showHeader && (
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold">{workout.title}</p>
              <p className="text-xs text-gray-500">
                {workout.instructor && <>{workout.instructor} · </>}
                {formatChartDate(workout.date)}{workout.duration_seconds != null ? ` · ${formatDuration(workout.duration_seconds)}` : ""}
              </p>
            </div>
            {displayName && (
              <p className="text-sm font-semibold text-gray-500">{displayName}</p>
            )}
          </div>
        )}

        {/* Chart SVG */}
        <div ref={chartRef} className="w-full" />

        {/* Footer stats */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
          {st.avgPower && <FooterStat label="Avg Power" value={workout.avg_output} unit="w" />}
          {st.totalOutput && <FooterStat label="Total Output" value={workout.total_work != null ? Math.round(workout.total_work / 1000) : null} unit="kj" />}
          {st.calories && <FooterStat label="Calories" value={workout.calories} unit="kcal" />}
          {st.distance && <FooterStat label="Distance" value={workout.distance != null ? workout.distance.toFixed(2) : null} unit="mi" />}
          {st.avgCadence && <FooterStat label="Avg Cadence" value={workout.avg_cadence} unit="rpm" />}
          {st.avgResistance && <FooterStat label="Avg Resistance" value={workout.avg_resistance != null ? `${workout.avg_resistance}%` : null} />}
          {st.avgSpeed && <FooterStat label="Avg Speed" value={workout.avg_speed != null ? workout.avg_speed.toFixed(1) : null} unit="mph" />}
          {st.avgHR && <FooterStat label="Avg HR" value={workout.avg_heart_rate} unit="bpm" />}
          {st.striveScore && <FooterStat label="Strive Score" value={workout.strive_score != null ? workout.strive_score.toFixed(1) : null} />}
          {st.ftp && ftp ? <FooterStat label="FTP" value={ftp} unit="w" /> : null}
        </div>
      </div>
    </div>
  );
}
