import { useRef, useEffect, useMemo } from "react";
import type { Workout } from "../types";
import { parsePerformanceGraph, parseInstructorCues, renderRideDetailChart } from "../lib/charts";
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

  const timeSeries = useMemo(() => {
    if (!workout.raw_performance_graph_json) return null;
    return parsePerformanceGraph(workout.raw_performance_graph_json);
  }, [workout.raw_performance_graph_json]);

  const cues = useMemo(() => {
    if (!workout.raw_ride_details_json) return null;
    return parseInstructorCues(workout.raw_ride_details_json);
  }, [workout.raw_ride_details_json]);

  useEffect(() => {
    if (!chartRef.current || !timeSeries) return;

    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, ftp || null, {
      width: el.clientWidth || 800,
    }, cues);
    el.replaceChildren(chart);

    return () => { el.replaceChildren(); };
  }, [timeSeries, ftp, cues]);

  if (!timeSeries) return null;

  const filename = `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Power Chart</h3>
        <ExportButton
          filename={filename}
          workout={workout}
          ftp={ftp}
          timeSeries={timeSeries}
          cues={cues}
        />
      </div>

      <div className="select-none rounded-lg border border-gray-200 bg-white p-4">
        {/* Header */}
        <div className="mb-3">
          <p className="text-sm font-semibold">{workout.title}</p>
          <p className="text-xs text-gray-500">
            {workout.instructor && <>{workout.instructor} · </>}
            {formatChartDate(workout.date)}{workout.duration_seconds != null ? ` · ${formatDuration(workout.duration_seconds)}` : ""}
          </p>
        </div>

        {/* Chart SVG */}
        <div ref={chartRef} className="w-full" />

        {/* Footer stats */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
          <FooterStat label="Avg Power" value={workout.avg_output} unit="w" />
          <FooterStat label="Total Output" value={workout.total_work != null ? Math.round(workout.total_work / 1000) : null} unit="kj" />
          <FooterStat label="Calories" value={workout.calories} unit="kcal" />
          <FooterStat label="Distance" value={workout.distance != null ? workout.distance.toFixed(2) : null} unit="mi" />
          <FooterStat label="Avg Cadence" value={workout.avg_cadence} unit="rpm" />
          <FooterStat label="Avg Resistance" value={workout.avg_resistance != null ? `${workout.avg_resistance}%` : null} />
          <FooterStat label="Avg HR" value={workout.avg_heart_rate} unit="bpm" />
          {ftp ? <FooterStat label="FTP" value={ftp} unit="w" /> : null}
        </div>
      </div>
    </div>
  );
}
