import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type { DashboardWidget, Workout, FilterCondition } from "../../types";
import { queryWorkouts, getDb } from "../../lib/database";
import { isConditionActive } from "../FilterEditors";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, isPowerZoneRide } from "../../lib/charts";
import { resolveBackgroundImageSrc } from "../../lib/exportUtils";
import { useShareChartStore, resolveDisplayName } from "../../stores/shareChartStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useWorkoutStore } from "../../stores/workoutStore";
import ChartCard from "../ChartCard";
import ShareModal from "../ShareModal";
import { useWidgetToolbarSlot } from "./WidgetToolbarContext";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
  preview?: boolean;
}

export default function LastWorkoutWidget({ widget, preview }: Props) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const toolbarSlotRef = useWidgetToolbarSlot();
  const syncGeneration = useWorkoutStore((s) => s.syncGeneration);

  const chartStyles = useShareChartStore((s) => s.styles);
  const activeSettings = useShareChartStore((s) => s.settings);
  const userProfile = useSessionStore((s) => s.userProfile);

  if (widget.config.type !== "last_workout") return null;
  const { title, filters, showHeader: configShowHeader, showFooter: configShowFooter, chartStyleId } = widget.config;

  const settings = (chartStyleId && chartStyles.find((s) => s.id === chartStyleId)?.settings) || activeSettings;

  const pelotonUsername = useMemo(() => {
    if (!userProfile?.raw_json) return null;
    try { return (JSON.parse(userProfile.raw_json).username as string) ?? null; } catch { return null; }
  }, [userProfile?.raw_json]);

  const displayName = resolveDisplayName(settings, pelotonUsername);

  const activeFiltersKey = useMemo(
    () => JSON.stringify((filters ?? []).filter(isConditionActive)),
    [filters],
  );

  const fetchWorkout = useCallback(async () => {
    setLoading(true);
    const conditions = JSON.parse(activeFiltersKey) as FilterCondition[];
    const results = await queryWorkouts({
      conditions,
      sort: { field: "date", direction: "desc" },
      search: "",
    });
    if (results.length > 0) {
      // queryWorkouts doesn't include raw JSON fields, fetch full row
      const d = await getDb();
      const rows = await d.select<Workout[]>("SELECT * FROM workouts WHERE id = $1", [results[0].id]);
      setWorkout(rows[0] ?? null);
    } else {
      setWorkout(null);
    }
    setLoading(false);
  }, [activeFiltersKey, syncGeneration]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  const ftp = useMemo(() => {
    if (!workout?.raw_detail_json) return null;
    try {
      const raw = JSON.parse(workout.raw_detail_json);
      const v = raw?.ftp_info?.ftp;
      return typeof v === "number" ? v : null;
    } catch { return null; }
  }, [workout?.raw_detail_json]);

  const timeSeries = useMemo(() => {
    if (!workout?.raw_performance_graph_json) return null;
    return parsePerformanceGraph(workout.raw_performance_graph_json);
  }, [workout?.raw_performance_graph_json]);

  const cues = useMemo(() => {
    if (!workout?.raw_performance_graph_json) return null;
    const offset = parsePedalingStartOffset(workout.raw_ride_details_json);
    return parseTargetMetrics(workout.raw_performance_graph_json, offset);
  }, [workout?.raw_performance_graph_json, workout?.raw_ride_details_json]);

  const isPZ = workout ? isPowerZoneRide(workout) : false;

  const backgroundImageSrc = useMemo(
    () => workout ? resolveBackgroundImageSrc(settings, workout.raw_ride_details_json) : null,
    [settings, workout?.raw_ride_details_json],
  );

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading...</div>;
  }

  if (!workout) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No matching workouts</div>;
  }

  if (!timeSeries) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No performance data</div>;
  }

  const shareButton = (
    <button
      onClick={() => setShareOpen(true)}
      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      title="Share"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V8" />
        <path d="M8 2V10" />
        <path d="M5 5L8 2L11 5" />
      </svg>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {title && <div className="mb-2 shrink-0 truncate text-sm font-medium text-gray-700">{title}</div>}
      <div className="min-h-0 flex-1">
        <ChartCard
          workout={workout}
          ftp={ftp}
          timeSeries={timeSeries}
          cues={cues}
          settings={settings}
          displayName={displayName}
          isPZ={isPZ}
          showHeader={preview ? false : configShowHeader}
          showFooter={preview ? false : configShowFooter}
          fitHeight
          backgroundImageSrc={backgroundImageSrc}
        />
      </div>
      {toolbarSlotRef?.current && createPortal(shareButton, toolbarSlotRef.current)}
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
