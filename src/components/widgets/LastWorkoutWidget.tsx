import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type { DashboardWidget, Workout, FilterCondition } from "../../types";
import { queryWorkouts, getDb } from "../../lib/database";
import { isConditionActive } from "../FilterEditors";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, isPowerZoneRide } from "../../lib/charts";
import { renderExportPng, resolveBackgroundImageSrc } from "../../lib/exportUtils";
import { useShareChartStore, resolveDisplayName } from "../../stores/shareChartStore";
import { useSessionStore } from "../../stores/sessionStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useWorkoutStore } from "../../stores/workoutStore";
import ChartCard from "../ChartCard";
import ShareMenu from "../ShareMenu";
import { useWidgetToolbarSlot } from "./WidgetToolbarContext";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
  preview?: boolean;
}

export default function LastWorkoutWidget({ widget, preview }: Props) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
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

  const filename = workout
    ? `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`
    : "chart";

  const handleCopy = useCallback(async () => {
    if (!workout || !timeSeries) return;
    const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  }, [workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc]);

  const handleSave = useCallback(async () => {
    if (!workout || !timeSeries) return;
    const filePath = await save({
      defaultPath: `${filename}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }, [workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc, filename]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading...</div>;
  }

  if (!workout) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No matching workouts</div>;
  }

  if (!timeSeries) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">No performance data</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {title && <div className="shrink-0 truncate text-sm font-medium text-gray-700">{title}</div>}
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
      {toolbarSlotRef?.current && createPortal(
        <ShareMenu onCopy={handleCopy} onSave={handleSave} compact />,
        toolbarSlotRef.current,
      )}
    </div>
  );
}
