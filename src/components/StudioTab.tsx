import { useState, useEffect, useMemo, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Workout } from "../types";
import { getShareableWorkouts } from "../lib/database";
import { parsePerformanceGraph, parseTargetMetrics, parsePedalingStartOffset, isPowerZoneRide } from "../lib/charts";
import { renderExportPng, resolveBackgroundImageSrc } from "../lib/exportUtils";
import { cachedFetchWorkoutDetail, cachedFetchPerformanceGraph, cachedFetchRideDetails } from "../lib/enrichmentCache";
import { updateWorkoutMetrics, updateWorkoutDetail, updateRideDetails } from "../lib/database";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import { useWorkoutStore } from "../stores/workoutStore";
import ShareMenu from "./ShareMenu";
import ChartCard from "./ChartCard";

function formatPickerDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

export default function StudioTab() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const settings = useShareChartStore((s) => s.settings);
  const styles = useShareChartStore((s) => s.styles);
  const activeStyleId = useShareChartStore((s) => s.activeStyleId);
  const setActiveStyle = useShareChartStore((s) => s.setActiveStyle);
  const createStyle = useShareChartStore((s) => s.createStyle);
  const duplicateStyle = useShareChartStore((s) => s.duplicateStyle);
  const renameStyle = useShareChartStore((s) => s.renameStyle);
  const deleteStyle = useShareChartStore((s) => s.deleteStyle);
  const updateOverlay = useShareChartStore((s) => s.updateOverlay);
  const updateOverlayColor = useShareChartStore((s) => s.updateOverlayColor);
  const updateStat = useShareChartStore((s) => s.updateStat);
  const update = useShareChartStore((s) => s.update);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const syncGeneration = useWorkoutStore((s) => s.syncGeneration);
  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);

  const pelotonUsername = useMemo(() => {
    if (!userProfile?.raw_json) return null;
    try { return (JSON.parse(userProfile.raw_json).username as string) ?? null; } catch { return null; }
  }, [userProfile?.raw_json]);

  const displayName = resolveDisplayName(settings, pelotonUsername);

  // Load workouts on mount and after sync completes
  useEffect(() => {
    getShareableWorkouts().then((rows) => {
      setWorkouts(rows);
      if (rows.length > 0) setSelectedId((prev) => prev ?? rows[0].id);
    });
  }, [syncGeneration]);

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

  const isPZ = workout ? isPowerZoneRide(workout) : false;

  const backgroundImageSrc = useMemo(
    () => workout ? resolveBackgroundImageSrc(settings, workout.raw_ride_details_json) : null,
    [settings, workout?.raw_ride_details_json],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  // On-demand enrichment: fetch detail, performance graph, and ride details
  useEffect(() => {
    if (!workout || !session?.accessToken) return;

    const accessToken = session.accessToken;
    const needsMetrics = workout.raw_performance_graph_json == null;
    const needsDetail = workout.raw_detail_json == null;
    const needsRideDetails = workout.raw_ride_details_json == null;
    if (!needsMetrics && !needsDetail && !needsRideDetails) return;

    let cancelled = false;

    const rideId = workout.ride_id;

    const detailPromise = needsDetail
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
          await updateWorkoutMetrics(workout.id, metrics, detailResult?.rawJson ?? null, rawPerfJson);
          Object.assign(patch, metrics, {
            raw_performance_graph_json: rawPerfJson,
          });
        }

        if (needsDetail && detailResult) {
          if (!needsMetrics) {
            // Detail fetched independently — persist just the detail JSON
            await updateWorkoutDetail(workout.id, detailResult.rawJson);
          }
          patch.raw_detail_json = detailResult.rawJson;
        }

        await updateRideDetails(workout.id, rideResult?.rawJson ?? null, workout.title);
        if (rideResult) {
          patch.raw_ride_details_json = rideResult.rawJson;
        }

        if (Object.keys(patch).length > 0) {
          setWorkouts((prev) =>
            prev.map((w) => (w.id === workout.id ? { ...w, ...patch } : w)),
          );
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [workout?.id, session?.accessToken]);

  const filename = workout
    ? `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`
    : "chart";

  async function handleCopy() {
    if (!workout || !timeSeries) return;
    const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
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
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  function handleUploadImage() {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round(h * (maxW / w));
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        update({ customBackgroundImageDataUrl: dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  const st = settings.stats;

  return (
    <div className="flex gap-6">
      {/* Left panel — Controls */}
      <div className="w-64 shrink-0 space-y-5">
        {/* Chart Style */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Chart Style</label>
          {renamingId ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (renameValue.trim()) renameStyle(renamingId, renameValue.trim());
                  setRenamingId(null);
                } else if (e.key === "Escape") {
                  setRenamingId(null);
                }
              }}
              onBlur={() => {
                if (renameValue.trim()) renameStyle(renamingId, renameValue.trim());
                setRenamingId(null);
              }}
              className="w-full rounded border border-blue-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <select
              value={activeStyleId}
              onChange={(e) => setActiveStyle(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="mt-1.5 flex gap-1">
            <button
              onClick={() => createStyle("New Style")}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
              title="New style"
            >+</button>
            <button
              onClick={() => duplicateStyle(activeStyleId, `${styles.find((s) => s.id === activeStyleId)?.name ?? "Style"} Copy`)}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
              title="Duplicate"
            >Dup</button>
            <button
              onClick={() => {
                const style = styles.find((s) => s.id === activeStyleId);
                if (!style || activeStyleId === "default") return;
                setRenameValue(style.name);
                setRenamingId(activeStyleId);
                setTimeout(() => renameInputRef.current?.select(), 0);
              }}
              disabled={activeStyleId === "default"}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Rename"
            >Rename</button>
            <button
              onClick={() => {
                if (activeStyleId === "default") return;
                const style = styles.find((s) => s.id === activeStyleId);
                if (style && window.confirm(`Delete "${style.name}"?`)) deleteStyle(activeStyleId);
              }}
              disabled={activeStyleId === "default"}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
              title="Delete"
            >Del</button>
          </div>
        </div>

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
          {settings.zoneBands !== "off" && (
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-sm text-gray-700">Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.zoneBandOpacity}
                onChange={(e) => update({ zoneBandOpacity: parseFloat(e.target.value) })}
                className="h-1 flex-1 cursor-pointer"
              />
              <span className="w-7 text-right text-xs text-gray-500">{Math.round(settings.zoneBandOpacity * 100)}%</span>
            </div>
          )}
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
          <Checkbox label="Dark mode" checked={settings.darkMode} onChange={(v) => update({ darkMode: v })} />
          <Checkbox label="Header (title/date)" checked={settings.showHeader} onChange={(v) => update({ showHeader: v })} />
          <Checkbox label="Y-axis & gridlines" checked={settings.showYAxis} onChange={(v) => update({ showYAxis: v })} />
        </div>

        {/* Background */}
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">Background</h4>
          <select
            value={settings.backgroundImage}
            onChange={(e) => update({ backgroundImage: e.target.value as "none" | "dark" | "ride" | "custom" })}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="none">Light</option>
            <option value="dark">Dark</option>
            <option value="ride">Ride Image</option>
            <option value="custom">Custom Upload</option>
          </select>
          {(settings.backgroundImage === "ride" || settings.backgroundImage === "custom") && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span className="shrink-0">Darkness</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.backgroundImageOpacity}
                  onChange={(e) => update({ backgroundImageOpacity: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-8 text-right text-xs text-gray-500">{Math.round(settings.backgroundImageOpacity * 100)}%</span>
              </label>
            </div>
          )}
          {settings.backgroundImage === "custom" && (
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleUploadImage}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Upload Image
              </button>
              {settings.customBackgroundImageDataUrl && (
                <img
                  src={settings.customBackgroundImageDataUrl}
                  alt="Custom background"
                  className="mt-1.5 h-16 w-full rounded border border-gray-200 object-cover"
                />
              )}
            </div>
          )}
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
          <ChartCard
            workout={workout}
            ftp={ftp}
            timeSeries={timeSeries}
            cues={cues}
            settings={settings}
            displayName={displayName}
            isPZ={isPZ}
            backgroundImageSrc={backgroundImageSrc}
          >
            <div className="mt-4 flex justify-end">
              <ShareMenu onCopy={handleCopy} onSave={handleSave} />
            </div>
          </ChartCard>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 text-gray-400">
            {workouts.length === 0 ? "No cycling workouts available" : "Select a workout"}
          </div>
        )}
      </div>
    </div>
  );
}
