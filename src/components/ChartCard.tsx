import { useRef, useEffect, useState, type ReactNode } from "react";
import type { Workout, ShareChartSettings, PerformanceTimeSeries } from "../types";
import type { InstructorCue } from "../lib/charts";
import { renderRideDetailChart } from "../lib/charts";

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface FooterStatProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  dark?: boolean;
}

function FooterStat({ label, value, unit, dark }: FooterStatProps) {
  if (value == null) return null;
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-semibold${dark ? " text-gray-100" : ""}`}>
        {value}{unit ? ` ${unit}` : ""}
      </span>
      <span className={`text-[10px]${dark ? " text-gray-400" : " text-gray-500"}`}>{label}</span>
    </div>
  );
}

interface ChartCardProps {
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
  cues: InstructorCue[] | null;
  settings: ShareChartSettings;
  displayName: string | null;
  isPZ: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  fitHeight?: boolean;
  children?: ReactNode;
}

export default function ChartCard({ workout, ftp, timeSeries, cues, settings, displayName, isPZ, showHeader, showFooter, fitHeight, children }: ChartCardProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Track container size via ResizeObserver for correct sizing
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(0);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (rect.width > 0) setChartWidth(rect.width);
      if (rect.height > 0) setChartHeight(rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render chart SVG
  useEffect(() => {
    if (!chartRef.current || chartWidth === 0) return;
    if (fitHeight && chartHeight === 0) return;
    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, ftp, {
      width: chartWidth,
      height: fitHeight ? chartHeight : undefined,
      durationSeconds: workout.duration_seconds ?? undefined,
      overlays: settings.overlays,
      overlayColors: settings.overlayColors,
      cueColor: settings.cueColor,
      showZoneBands: settings.zoneBands === "always" || (settings.zoneBands === "pz-only" && isPZ),
      zoneBandOpacity: settings.zoneBandOpacity,
      darkMode: settings.darkMode,
      showInstructorCues: settings.showInstructorCues,
      showYAxis: settings.showYAxis,
    }, cues);
    el.replaceChildren(chart);
    return () => { el.replaceChildren(); };
  }, [timeSeries, ftp, cues, settings, workout.duration_seconds, chartWidth, chartHeight, fitHeight, isPZ]);

  const st = settings.stats;
  const headerVisible = showHeader ?? settings.showHeader;
  const footerVisible = showFooter ?? true;
  const dark = settings.darkMode;

  return (
    <div className={`select-none rounded-lg border p-4${fitHeight ? " flex h-full flex-col" : ""}${dark ? " border-gray-700 bg-gray-900" : " border-gray-200 bg-white"}`}>
      {/* Header */}
      {headerVisible && (
        <div className="mb-3 flex shrink-0 items-start justify-between">
          <div>
            <p className={`text-sm font-semibold${dark ? " text-gray-100" : ""}`}>{workout.title}</p>
            <p className={`text-xs${dark ? " text-gray-400" : " text-gray-500"}`}>
              {workout.instructor && <>{workout.instructor} · </>}
              {formatDate(workout.date)}
            </p>
          </div>
          <div className="text-right">
            {displayName && <p className={`text-sm font-semibold${dark ? " text-gray-400" : " text-gray-500"}`}>{displayName}</p>}
            <p className={`text-xs${dark ? " text-gray-400" : " text-gray-500"}`}>{formatDateTime(workout.date)}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div ref={chartRef} className={`w-full${fitHeight ? " min-h-0 flex-1" : ""}`} />

      {/* Footer stats */}
      {footerVisible && (
        <div className={`mt-3 flex shrink-0 flex-wrap justify-center gap-x-6 gap-y-2 border-t pt-3${dark ? " border-gray-700" : " border-gray-100"}`}>
          {st.avgPower && <FooterStat label="Avg Power" value={workout.avg_output} unit="w" dark={dark} />}
          {st.totalOutput && <FooterStat label="Total Output" value={workout.total_work != null ? Math.round(workout.total_work / 1000) : null} unit="kj" dark={dark} />}
          {st.calories && <FooterStat label="Calories" value={workout.calories} unit="kcal" dark={dark} />}
          {st.distance && <FooterStat label="Distance" value={workout.distance != null ? workout.distance.toFixed(2) : null} unit="mi" dark={dark} />}
          {st.avgCadence && <FooterStat label="Avg Cadence" value={workout.avg_cadence} unit="rpm" dark={dark} />}
          {st.avgResistance && <FooterStat label="Avg Resistance" value={workout.avg_resistance != null ? `${workout.avg_resistance}%` : null} dark={dark} />}
          {st.avgSpeed && <FooterStat label="Avg Speed" value={workout.avg_speed != null ? workout.avg_speed.toFixed(1) : null} unit="mph" dark={dark} />}
          {st.avgHR && <FooterStat label="Avg HR" value={workout.avg_heart_rate} unit="bpm" dark={dark} />}
          {st.striveScore && <FooterStat label="Strive Score" value={workout.strive_score != null ? workout.strive_score.toFixed(1) : null} dark={dark} />}
          {st.ftp && ftp ? <FooterStat label="FTP" value={ftp} unit="w" dark={dark} /> : null}
        </div>
      )}

      {/* Slot for export/share buttons */}
      {children}
    </div>
  );
}
