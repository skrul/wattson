import { useState, useEffect, useRef, useMemo } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Workout } from "../types";
import { AuthError, fetchPerformanceGraph } from "../lib/api";
import { updateWorkoutMetrics } from "../lib/database";
import { svgToImage } from "../lib/exportUtils";
import { useWorkoutStore } from "../stores/workoutStore";
import {
  parsePerformanceGraph,
  renderCompareChart,
  COMPARE_METRICS,
  type CompareMetric,
} from "../lib/charts";
import ShareMenu from "./ShareMenu";

interface CompareTabProps {
  workouts: Workout[];
  currentId: string;
  accessToken: string | null;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const EXPORT_WIDTH = 1200;
const SCALE = 2;
const PADDING = 32;
const CHART_WIDTH = EXPORT_WIDTH - PADDING * 2;
const CHART_HEIGHT = 300;

// Observable Plot's default categorical palette (Tableau 10)
const TABLEAU_10 = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];

async function renderCompareExportPng(
  chartRides: { label: string; timeSeries: import("../types").PerformanceTimeSeries }[],
  metric: CompareMetric,
  title: string,
  durationSeconds?: number,
): Promise<Blob> {
  const chartEl = renderCompareChart(chartRides, metric, CHART_WIDTH, CHART_HEIGHT, durationSeconds);
  const chartImg = await svgToImage(chartEl);

  const metricLabel = COMPARE_METRICS.find((m) => m.key === metric)?.label ?? metric;
  const subtitle = `${chartRides.length} rides · ${metricLabel}`;

  // Measure legend layout
  const labels = chartRides.map((r) => r.label);
  const swatchSize = 12;
  const swatchGap = 6;
  const itemGap = 16;
  const legendFont = "12px system-ui, -apple-system, sans-serif";

  // Use an offscreen canvas to measure text
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = legendFont;
  const itemWidths = labels.map(
    (l) => swatchSize + swatchGap + measureCtx.measureText(l).width,
  );

  // Wrap legend items into rows
  const maxRowWidth = CHART_WIDTH;
  const legendRows: number[][] = [[]];
  let rowWidth = 0;
  for (let i = 0; i < itemWidths.length; i++) {
    const w = itemWidths[i];
    if (legendRows[legendRows.length - 1].length > 0 && rowWidth + itemGap + w > maxRowWidth) {
      legendRows.push([]);
      rowWidth = 0;
    }
    if (legendRows[legendRows.length - 1].length > 0) rowWidth += itemGap;
    rowWidth += w;
    legendRows[legendRows.length - 1].push(i);
  }

  const legendLineHeight = 20;
  const legendHeight = legendRows.length * legendLineHeight + 12;

  const headerHeight = 50;
  const totalHeight = PADDING + headerHeight + CHART_HEIGHT + legendHeight + PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, EXPORT_WIDTH, totalHeight);

  let y = PADDING;

  ctx.fillStyle = "#111827";
  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(title, PADDING, y + 18);

  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.fillText(subtitle, PADDING, y + 36);

  y += headerHeight;

  ctx.drawImage(chartImg, PADDING, y, CHART_WIDTH, CHART_HEIGHT);
  y += CHART_HEIGHT + 8;

  // Draw legend
  ctx.font = legendFont;
  for (const row of legendRows) {
    let x = PADDING;
    for (const idx of row) {
      const color = TABLEAU_10[idx % TABLEAU_10.length];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, swatchSize, swatchSize);
      x += swatchSize + swatchGap;
      ctx.fillStyle = "#374151";
      ctx.fillText(labels[idx], x, y + swatchSize - 1);
      x += measureCtx.measureText(labels[idx]).width + itemGap;
    }
    y += legendLineHeight;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

function MetricCell({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold">{value ?? "—"}</span>
      <span className="text-xs text-gray-500">{label}{unit ? ` (${unit})` : ""}</span>
    </div>
  );
}

function parseFtp(rawDetailJson: string | null | undefined): number | null {
  if (!rawDetailJson) return null;
  try {
    const raw = JSON.parse(rawDetailJson);
    const ftp = raw?.ftp_info?.ftp;
    return typeof ftp === "number" ? ftp : null;
  } catch { return null; }
}

const MAX_AUTO_SELECT = 10;
const AUTO_SELECT_RECENT = 5;

/** Pick the default set of selected ride IDs. */
function defaultSelection(workouts: Workout[], currentId: string): Set<string> {
  if (workouts.length <= MAX_AUTO_SELECT) {
    return new Set(workouts.map((w) => w.id));
  }
  // Select the most recent N rides, always including the current one
  const sorted = [...workouts].sort((a, b) => b.date - a.date);
  const ids = new Set(sorted.slice(0, AUTO_SELECT_RECENT).map((w) => w.id));
  ids.add(currentId);
  return ids;
}

export default function CompareTab({ workouts: initialWorkouts, currentId, accessToken }: CompareTabProps) {
  const updateWorkout = useWorkoutStore((s) => s.updateWorkout);
  const storeWorkouts = useWorkoutStore((s) => s.workouts);

  // Merge store data (fresh metrics) with initial data (has raw JSON fields the store omits)
  const workouts = useMemo(() => {
    const storeMap = new Map(storeWorkouts.map((w) => [w.id, w]));
    return initialWorkouts.map((w) => {
      const sw = storeMap.get(w.id);
      return sw ? {
        ...w, ...sw,
        raw_performance_graph_json: sw.raw_performance_graph_json ?? w.raw_performance_graph_json,
        raw_detail_json: sw.raw_detail_json ?? w.raw_detail_json,
      } : w;
    });
  }, [initialWorkouts, storeWorkouts]);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => defaultSelection(workouts, currentId));
  const [metric, setMetric] = useState<CompareMetric>("output");
  const chartRef = useRef<HTMLDivElement>(null);

  // Keep selectedIds in sync when workouts list changes (new rides loaded)
  useEffect(() => {
    setSelectedIds((prev) => {
      const allIds = workouts.map((w) => w.id);
      const newIds = allIds.filter((id) => !prev.has(id));
      if (newIds.length === 0) return prev;
      // If still under the threshold, add all new ones
      if (prev.size + newIds.length <= MAX_AUTO_SELECT) {
        return new Set([...prev, ...newIds]);
      }
      // Otherwise keep current selection as-is (user can manually add)
      return prev;
    });
  }, [workouts.map((w) => w.id).join(",")]);

  // Fetch performance data for attempts that are missing it
  useEffect(() => {
    if (!accessToken) return;

    const missing = workouts.filter((w) => w.raw_performance_graph_json == null);
    if (missing.length === 0) return;

    let cancelled = false;
    setFetchProgress({ done: 0, total: missing.length });

    (async () => {
      let done = 0;
      for (const w of missing) {
        if (cancelled) break;
        setFetchingIds(new Set([w.id]));
        try {
          const perfResult = await fetchPerformanceGraph(w.id, accessToken);
          if (cancelled) break;

          const { rawJson: rawPerfJson, ...metrics } = perfResult;
          await updateWorkoutMetrics(w.id, metrics, null, rawPerfJson);
          updateWorkout(w.id, {
            ...metrics,
            raw_performance_graph_json: rawPerfJson,
          });
        } catch (e) {
          if (e instanceof AuthError) break;
          // Other errors: skip this workout, continue
        }
        done++;
        if (!cancelled) setFetchProgress({ done, total: missing.length });

        // Rate limit: match enrichment store's 2s delay
        if (!cancelled) await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) {
        setFetchingIds(new Set());
        setFetchProgress(null);
      }
    })();

    return () => { cancelled = true; };
  }, [workouts.map((w) => w.id).join(","), accessToken]);

  // Build chart rides from selected workouts that have performance data, sorted by date
  const chartRides = useMemo(() => {
    return [...workouts]
      .filter((w) => selectedIds.has(w.id) && w.raw_performance_graph_json != null)
      .sort((a, b) => a.date - b.date)
      .map((w) => {
        const ts = parsePerformanceGraph(w.raw_performance_graph_json!);
        if (!ts) return null;
        return { label: formatDate(w.date), timeSeries: ts };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [workouts, selectedIds, metric]);

  // Render chart
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    el.innerHTML = "";
    if (chartRides.length === 0) return;
    const duration = workouts[0]?.duration_seconds ?? undefined;
    const chart = renderCompareChart(chartRides, metric, el.clientWidth || 800, 300, duration);
    el.appendChild(chart);
  }, [chartRides, metric]);

  const sorted = [...workouts].sort((a, b) => b.date - a.date);
  const allSelected = workouts.every((w) => selectedIds.has(w.id));
  const noneSelected = selectedIds.size === 0;

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(workouts.map((w) => w.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  const rideTitle = workouts[0]?.title ?? "Compare";
  const duration = workouts[0]?.duration_seconds ?? undefined;

  async function handleCopy() {
    const blobPromise = renderCompareExportPng(chartRides, metric, rideTitle, duration);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  }

  async function handleSave() {
    const filename = rideTitle.replace(/[^a-zA-Z0-9]/g, "-");
    const filePath = await save({
      defaultPath: `${filename}-compare.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderCompareExportPng(chartRides, metric, rideTitle, duration);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={metric}
          onChange={(e) => setMetric(e.target.value as CompareMetric)}
        >
          {COMPARE_METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <button
          className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
          disabled={allSelected}
          onClick={selectAll}
        >
          Select all
        </button>
        <button
          className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
          disabled={noneSelected}
          onClick={selectNone}
        >
          Select none
        </button>
        {chartRides.length > 0 && (
          <>
            <div className="mx-1 h-4 border-l border-gray-300" />
            <ShareMenu onCopy={handleCopy} onSave={handleSave} />
          </>
        )}
      </div>

      {/* Chart */}
      <div className="w-full min-h-[380px]">
        <div ref={chartRef} className={chartRides.length > 0 ? "" : "hidden"} />
        {chartRides.length === 0 && (
          <div className="flex h-[380px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
            Select rides to compare
          </div>
        )}
      </div>

      {fetchProgress && (
        <div className="text-sm text-gray-500">
          Loading ride details ({fetchProgress.done}/{fetchProgress.total})...
        </div>
      )}
      {sorted.map((w) => {
        const isCurrent = w.id === currentId;
        return (
          <div
            key={w.id}
            className={`rounded-lg border p-4 ${
              isCurrent
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(w.id)}
                onChange={() => toggleId(w.id)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">{formatDate(w.date)}</span>
              {isCurrent && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  Current
                </span>
              )}
              {fetchingIds.has(w.id) && (
                <span className="text-xs text-gray-400">Loading details...</span>
              )}
            </div>
            <div className="grid grid-cols-6 gap-4">
              <MetricCell label="Output" value={w.total_work != null ? Math.round(w.total_work / 1000) : null} unit="kj" />
              <MetricCell label="Calories" value={w.calories} unit="kcal" />
              <MetricCell label="Distance" value={w.distance != null ? w.distance.toFixed(2) : null} unit="mi" />
              <MetricCell label="Avg HR" value={w.avg_heart_rate} unit="bpm" />
              <MetricCell label="Strive" value={w.strive_score != null ? w.strive_score.toFixed(1) : null} />
              <MetricCell label="FTP" value={parseFtp(w.raw_detail_json)} unit="w" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
