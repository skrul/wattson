import { useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Workout, PerformanceTimeSeries } from "../types";
import {
  renderRideDetailChart,
  isPowerZoneRide,
  parseTargetMetrics,
  parsePedalingStartOffset,
  parsePlaylist,
  parseHrZones,
  type InstructorCue,
  type SongCue,
  type HrZoneConfig,
} from "../lib/charts";
import { useSessionStore } from "../stores/sessionStore";
import { useAnalyzeStore, type AnalyzeOverlays } from "../stores/analyzeStore";

interface AnalyzeTabProps {
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
}

const OVERLAY_COLORS: Record<keyof AnalyzeOverlays, string> = {
  output: "#e44",
  heartRate: "#e91e63",
  cadence: "#2196f3",
  resistance: "#4caf50",
  speed: "#ff9800",
};

const OVERLAY_LABELS: Record<keyof AnalyzeOverlays, string> = {
  output: "Output",
  heartRate: "HR",
  cadence: "Cadence",
  resistance: "Resistance",
  speed: "Speed",
};

const OVERLAY_KEYS: (keyof AnalyzeOverlays)[] = ["output", "heartRate", "cadence", "resistance", "speed"];

export default function AnalyzeTab({ workout, ftp, timeSeries }: AnalyzeTabProps) {
  const overlays = useAnalyzeStore((s) => s.overlays);
  const toggleOverlay = useAnalyzeStore((s) => s.toggleOverlay);
  const showZoneBands = useAnalyzeStore((s) => s.showZoneBands);
  const setShowZoneBands = useAnalyzeStore((s) => s.setShowZoneBands);
  const showInstructorCues = useAnalyzeStore((s) => s.showInstructorCues);
  const setShowInstructorCues = useAnalyzeStore((s) => s.setShowInstructorCues);
  const showHrZones = useAnalyzeStore((s) => s.showHrZones);
  const setShowHrZones = useAnalyzeStore((s) => s.setShowHrZones);
  const showSongs = useAnalyzeStore((s) => s.showSongs);
  const setShowSongs = useAnalyzeStore((s) => s.setShowSongs);
  const initDefaults = useAnalyzeStore((s) => s.initDefaults);

  const isPZ = isPowerZoneRide(workout);
  const hasFtp = ftp != null;

  // Set sensible defaults on first use
  useEffect(() => { initDefaults(isPZ, hasFtp); }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const userProfile = useSessionStore((s) => s.userProfile);
  const hrZoneConfig = useMemo((): HrZoneConfig | null => {
    return parseHrZones(userProfile?.raw_json);
  }, [userProfile?.raw_json]);

  const hasHrData = timeSeries.heartRate.length > 0;
  const canShowHrZones = hrZoneConfig != null && hasHrData;

  // Zone bands and HR zones are mutually exclusive
  const toggleZoneBands = () => {
    if (!showZoneBands) setShowHrZones(false);
    setShowZoneBands(!showZoneBands);
  };
  const toggleHrZones = () => {
    if (!showHrZones) setShowZoneBands(false);
    setShowHrZones(!showHrZones);
  };

  const cues = useMemo((): InstructorCue[] | null => {
    if (!workout.raw_performance_graph_json) return null;
    const offset = parsePedalingStartOffset(workout.raw_ride_details_json);
    return parseTargetMetrics(workout.raw_performance_graph_json, offset);
  }, [workout.raw_performance_graph_json, workout.raw_ride_details_json]);

  const songs = useMemo((): SongCue[] | null => {
    const offset = parsePedalingStartOffset(workout.raw_ride_details_json);
    return parsePlaylist(workout.raw_ride_details_json, offset);
  }, [workout.raw_ride_details_json]);

  const hasSongs = songs != null && songs.length > 0;

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Check which overlays have data
  const hasData: Record<keyof AnalyzeOverlays, boolean> = {
    output: timeSeries.output.length > 0,
    heartRate: timeSeries.heartRate.length > 0,
    cadence: timeSeries.cadence.length > 0,
    resistance: timeSeries.resistance.length > 0,
    speed: timeSeries.speed.length > 0,
  };

  const togglePills = (
    <div className="flex flex-wrap items-center gap-1.5">
      {OVERLAY_KEYS.filter((key) => hasData[key]).map((key) => (
        <button
          key={key}
          onClick={() => toggleOverlay(key)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            overlays[key]
              ? "text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          style={overlays[key] ? { backgroundColor: OVERLAY_COLORS[key] } : undefined}
        >
          {OVERLAY_LABELS[key]}
        </button>
      ))}

      {hasFtp && (
        <>
          <span className="mx-1 text-gray-300">|</span>
          <button
            onClick={toggleZoneBands}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              showZoneBands
                ? "bg-gray-700 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            PZ Bands
          </button>
        </>
      )}

      {hasFtp && cues && cues.length > 0 && (
        <button
          onClick={() => setShowInstructorCues(!showInstructorCues)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            showInstructorCues
              ? "bg-gray-700 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Cues
        </button>
      )}

      {hasSongs && (
        <button
          onClick={() => setShowSongs(!showSongs)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            showSongs
              ? "bg-gray-700 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Songs
        </button>
      )}

      {canShowHrZones && (
        <button
          onClick={toggleHrZones}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            showHrZones
              ? "bg-gray-700 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          HR Zones
        </button>
      )}

      <span className="mx-1 text-gray-300">|</span>
      <button
        onClick={() => setIsFullscreen((v) => !v)}
        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200"
        title="Fullscreen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="inline h-3.5 w-3.5">
          <path d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 001.06 1.06zM2 17.25v-4.5a.75.75 0 011.5 0v2.69l3.22-3.22a.75.75 0 011.06 1.06L4.56 16.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM12.22 13.28l3.22 3.22h-2.69a.75.75 0 000 1.5h4.5a.75.75 0 00.75-.75v-4.5a.75.75 0 00-1.5 0v2.69l-3.22-3.22a.75.75 0 10-1.06 1.06zM3.5 4.56l3.22 3.22a.75.75 0 001.06-1.06L4.56 3.5h2.69a.75.75 0 000-1.5h-4.5a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0V4.56z" />
        </svg>
      </button>
    </div>
  );

  const chartContent = (
    <AnalyzeChart
      timeSeries={timeSeries}
      ftp={ftp}
      overlays={overlays}
      showZoneBands={showZoneBands}
      showInstructorCues={showInstructorCues}
      cues={cues}
      songs={showSongs ? songs : null}
      durationSeconds={workout.duration_seconds ?? undefined}
      hrZones={canShowHrZones && showHrZones ? hrZoneConfig : undefined}
      hrZonesForTooltip={canShowHrZones ? hrZoneConfig : undefined}
    />
  );

  if (isFullscreen) {
    return (
      <>
        {/* Inline placeholder so the tab content doesn't collapse */}
        <div className="text-sm text-gray-400">Chart is in fullscreen mode. Press Escape to exit.</div>
        {createPortal(
          <div className="fixed inset-0 z-[9998] flex flex-col bg-white">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{workout.title}</p>
                <p className="text-xs text-gray-500">{workout.instructor}</p>
              </div>
              <button
                onClick={() => setIsFullscreen(false)}
                className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                Exit Fullscreen
              </button>
            </div>
            {/* Toggle pills */}
            <div className="shrink-0 border-b px-4 py-2">
              {togglePills}
            </div>
            {/* Chart fills remaining space */}
            <div className="min-h-0 flex-1 p-4">
              {chartContent}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {togglePills}
      <div className="h-[350px]">
        {chartContent}
      </div>
    </div>
  );
}

interface AnalyzeChartProps {
  timeSeries: PerformanceTimeSeries;
  ftp: number | null;
  overlays: AnalyzeOverlays;
  showZoneBands: boolean;
  showInstructorCues: boolean;
  cues: InstructorCue[] | null;
  songs: SongCue[] | null;
  durationSeconds?: number;
  hrZones?: HrZoneConfig;
  hrZonesForTooltip?: HrZoneConfig;
}

function AnalyzeChart({ timeSeries, ftp, overlays, showZoneBands, showInstructorCues, cues, songs, durationSeconds, hrZones, hrZonesForTooltip }: AnalyzeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!chartRef.current || chartWidth === 0 || chartHeight === 0) return;
    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, ftp, {
      width: chartWidth,
      height: chartHeight,
      durationSeconds,
      overlays,
      showZoneBands,
      showInstructorCues,
      showYAxis: true,
      interactive: true,
      songs: songs ?? undefined,
      hrZones,
      hrZonesForTooltip,
    }, showInstructorCues ? cues : null);
    el.replaceChildren(chart);
    return () => { el.replaceChildren(); };
  }, [timeSeries, ftp, overlays, showZoneBands, showInstructorCues, cues, songs, durationSeconds, hrZones, hrZonesForTooltip, chartWidth, chartHeight]);

  return <div ref={chartRef} className="h-full w-full" />;
}
