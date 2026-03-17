import { useState, useEffect, useRef, useMemo } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Workout } from "../types";
import { getShareableWorkouts } from "../lib/database";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, renderRideDetailChart } from "../lib/charts";
import { renderExportPng } from "../lib/exportUtils";
import { cachedFetchWorkoutDetail, cachedFetchPerformanceGraph, cachedFetchRideDetails } from "../lib/enrichmentCache";
import { updateWorkoutMetrics, updateRideDetails } from "../lib/database";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ShareMenu from "./ShareMenu";

function formatPickerDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


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

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300"
      />
      {label}
    </label>
  );
}

interface ColorSwatchProps {
  color: string;
  onChange: (color: string) => void;
}

function ColorSwatch({ color, onChange }: ColorSwatchProps) {
  return (
    <div className="relative h-4 w-4 shrink-0 rounded border border-gray-300" style={{ backgroundColor: color }}>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

interface OverlayRowProps {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  color: string;
  onColorChange: (color: string) => void;
}

function OverlayRow({ label, checked, onToggle, color, onColorChange }: OverlayRowProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300"
        />
        {label}
      </label>
      <ColorSwatch color={color} onChange={onColorChange} />
    </div>
  );
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

export default function StudioTab() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const settings = useShareChartStore((s) => s.settings);
  const updateOverlay = useShareChartStore((s) => s.updateOverlay);
  const updateOverlayColor = useShareChartStore((s) => s.updateOverlayColor);
  const updateStat = useShareChartStore((s) => s.updateStat);
  const update = useShareChartStore((s) => s.update);
  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);

  const pelotonUsername = useMemo(() => {
    if (!userProfile?.raw_json) return null;
    try { return (JSON.parse(userProfile.raw_json).username as string) ?? null; } catch { return null; }
  }, [userProfile?.raw_json]);

  const displayName = resolveDisplayName(settings, pelotonUsername);

  // Load workouts on mount
  useEffect(() => {
    getShareableWorkouts().then((rows) => {
      setWorkouts(rows);
      if (rows.length > 0) setSelectedId(rows[0].id);
    });
  }, []);

  const workout = useMemo(
    () => workouts.find((w) => w.id === selectedId) ?? null,
    [workouts, selectedId],
  );

  const ftp = useMemo(() => parseWorkoutFtp(workout?.raw_detail_json), [workout?.raw_detail_json]);

  const timeSeries = useMemo(() => {
    if (!workout?.raw_performance_graph_json) return null;
    return parsePerformanceGraph(workout.raw_performance_graph_json);
  }, [workout?.raw_performance_graph_json]);

  const cues = useMemo(() => {
    if (!workout?.raw_performance_graph_json) return null;
    const offset = parsePedalingStartOffset(workout.raw_ride_details_json);
    return parseTargetMetrics(workout.raw_performance_graph_json, offset);
  }, [workout?.raw_performance_graph_json, workout?.raw_ride_details_json]);

  const isPZ = workout?.class_type === "Power Zone";

  // On-demand enrichment: fetch detail, performance graph, and ride details
  useEffect(() => {
    if (!workout || !session?.accessToken) return;

    const accessToken = session.accessToken;
    const needsMetrics = workout.raw_performance_graph_json == null;
    const needsRideDetails = workout.raw_ride_details_json == null;
    if (!needsMetrics && !needsRideDetails) return;

    let cancelled = false;

    const rideId = workout.ride_id;

    const detailPromise = needsMetrics
      ? cachedFetchWorkoutDetail(workout.id, accessToken).catch(() => null)
      : Promise.resolve(null);

    const perfPromise = needsMetrics
      ? cachedFetchPerformanceGraph(workout.id, accessToken)
      : Promise.resolve(null);

    const ridePromise = needsRideDetails && rideId
      ? cachedFetchRideDetails(rideId, accessToken).catch(() => null)
      : Promise.resolve(null);

    Promise.all([detailPromise, perfPromise, ridePromise])
      .then(async ([detailResult, perfResult, rideResult]) => {
        if (cancelled) return;
        const patch: Partial<Workout> = {};

        if (needsMetrics && perfResult) {
          const { rawJson: rawPerfJson, ...metrics } = perfResult;
          const rawDetailJson = detailResult?.rawJson ?? null;
          await updateWorkoutMetrics(workout.id, metrics, rawDetailJson, rawPerfJson);
          Object.assign(patch, metrics, {
            raw_detail_json: rawDetailJson,
            raw_performance_graph_json: rawPerfJson,
          });
        }

        await updateRideDetails(workout.id, rideResult?.rawJson ?? null);
        if (rideResult) {
          patch.raw_ride_details_json = rideResult.rawJson;
        }

        if (Object.keys(patch).length > 0) {
          setWorkouts((prev) =>
            prev.map((w) => (w.id === workout.id ? { ...w, ...patch } : w)),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("Studio enrichment failed:", err);
      });

    return () => { cancelled = true; };
  }, [workout?.id, session?.accessToken]);

  // Track container width via ResizeObserver so chart re-renders when tab becomes visible
  const [chartWidth, setChartWidth] = useState(0);
  const hasChart = !!(workout && timeSeries);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasChart]);

  // Render chart
  useEffect(() => {
    if (!chartRef.current || !timeSeries || chartWidth === 0) return;
    const el = chartRef.current;
    const chart = renderRideDetailChart(timeSeries, ftp, {
      width: chartWidth,
      durationSeconds: workout?.duration_seconds ?? undefined,
      overlays: settings.overlays,
      overlayColors: settings.overlayColors,
      cueColor: settings.cueColor,
      showZoneBands: settings.zoneBands === "always" || (settings.zoneBands === "pz-only" && isPZ),
      showInstructorCues: settings.showInstructorCues,
      showYAxis: settings.showYAxis,
    }, cues);
    el.replaceChildren(chart);
    return () => { el.replaceChildren(); };
  }, [timeSeries, ftp, cues, settings, workout?.duration_seconds, chartWidth]);

  const filename = workout
    ? `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`
    : "chart";

  async function handleCopy() {
    if (!workout || !timeSeries) return;
    const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  }

  async function handleSave() {
    if (!workout || !timeSeries) return;
    const filePath = await save({
      defaultPath: `${filename}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  const st = settings.stats;

  return (
    <div className="flex gap-6">
      {/* Left panel — Controls */}
      <div className="w-64 shrink-0 space-y-5">
        {/* Workout picker */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Workout</label>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} — {formatPickerDate(w.date)}
              </option>
            ))}
          </select>
        </div>

        {/* Chart Overlays */}
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">Chart Overlays</h4>
          <OverlayRow label="Output/Power" checked={settings.overlays.output} onToggle={(v) => updateOverlay("output", v)} color={settings.overlayColors.output} onColorChange={(v) => updateOverlayColor("output", v)} />
          <OverlayRow label="Heart Rate" checked={settings.overlays.heartRate} onToggle={(v) => updateOverlay("heartRate", v)} color={settings.overlayColors.heartRate} onColorChange={(v) => updateOverlayColor("heartRate", v)} />
          <OverlayRow label="Cadence" checked={settings.overlays.cadence} onToggle={(v) => updateOverlay("cadence", v)} color={settings.overlayColors.cadence} onColorChange={(v) => updateOverlayColor("cadence", v)} />
          <OverlayRow label="Resistance" checked={settings.overlays.resistance} onToggle={(v) => updateOverlay("resistance", v)} color={settings.overlayColors.resistance} onColorChange={(v) => updateOverlayColor("resistance", v)} />
          <OverlayRow label="Speed" checked={settings.overlays.speed} onToggle={(v) => updateOverlay("speed", v)} color={settings.overlayColors.speed} onColorChange={(v) => updateOverlayColor("speed", v)} />
        </div>

        {/* Chart Options */}
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">Chart Options</h4>
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-sm text-gray-700">Power zones</span>
            <select
              value={settings.zoneBands}
              onChange={(e) => update({ zoneBands: e.target.value as "off" | "always" | "pz-only" })}
              className="rounded border border-gray-300 px-1.5 py-0.5 text-sm"
            >
              <option value="off">Off</option>
              <option value="pz-only">PZ rides only</option>
              <option value="always">Always</option>
            </select>
          </div>
          <div className="flex items-center gap-2 py-0.5">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings.showInstructorCues}
                onChange={(e) => update({ showInstructorCues: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Target metrics
            </label>
            <ColorSwatch color={settings.cueColor} onChange={(v) => update({ cueColor: v })} />
          </div>
          <Checkbox label="Header (title/date)" checked={settings.showHeader} onChange={(v) => update({ showHeader: v })} />
          <Checkbox label="Y-axis & gridlines" checked={settings.showYAxis} onChange={(v) => update({ showYAxis: v })} />
        </div>

        {/* Display Name */}
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">Display Name</h4>
          <Checkbox label="Show name on chart" checked={settings.showUsername} onChange={(v) => update({ showUsername: v })} />
          {settings.showUsername && (
            <input
              type="text"
              value={settings.customUsername}
              onChange={(e) => update({ customUsername: e.target.value })}
              placeholder={pelotonUsername ?? "Enter name"}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm placeholder:text-gray-400"
            />
          )}
        </div>

        {/* Footer Stats */}
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">Footer Stats</h4>
          <Checkbox label="Avg Power" checked={st.avgPower} onChange={(v) => updateStat("avgPower", v)} />
          <Checkbox label="Total Output" checked={st.totalOutput} onChange={(v) => updateStat("totalOutput", v)} />
          <Checkbox label="Calories" checked={st.calories} onChange={(v) => updateStat("calories", v)} />
          <Checkbox label="Distance" checked={st.distance} onChange={(v) => updateStat("distance", v)} />
          <Checkbox label="Avg Cadence" checked={st.avgCadence} onChange={(v) => updateStat("avgCadence", v)} />
          <Checkbox label="Avg Resistance" checked={st.avgResistance} onChange={(v) => updateStat("avgResistance", v)} />
          <Checkbox label="Avg Speed" checked={st.avgSpeed} onChange={(v) => updateStat("avgSpeed", v)} />
          <Checkbox label="Avg HR" checked={st.avgHR} onChange={(v) => updateStat("avgHR", v)} />
          <Checkbox label="Strive Score" checked={st.striveScore} onChange={(v) => updateStat("striveScore", v)} />
          <Checkbox label="FTP" checked={st.ftp} onChange={(v) => updateStat("ftp", v)} />
        </div>
      </div>

      {/* Right panel — Live Preview */}
      <div className="min-w-0 flex-1">
        {workout && timeSeries ? (
          <div className="select-none rounded-lg border border-gray-200 bg-white p-4">
            {/* Header */}
            {settings.showHeader && (
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{workout.title}</p>
                  <p className="text-xs text-gray-500">
                    {workout.instructor && <>{workout.instructor} · </>}
                    {formatPickerDate(workout.date)}
                  </p>
                </div>
                <div className="text-right">
                  {displayName && <p className="text-sm font-semibold text-gray-500">{displayName}</p>}
                  <p className="text-xs text-gray-500">{formatDateTime(workout.date)}</p>
                </div>
              </div>
            )}

            {/* Chart */}
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

            {/* Export buttons */}
            <div className="mt-4 flex justify-end">
              <ShareMenu onCopy={handleCopy} onSave={handleSave} />
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 text-gray-400">
            {workouts.length === 0 ? "No cycling workouts with chart data available" : "Select a workout"}
          </div>
        )}
      </div>
    </div>
  );
}
