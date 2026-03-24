import * as Plot from "@observablehq/plot";
import { scaleLinear } from "d3-scale";
import { extent } from "d3-array";
import type { PerformanceTimeSeries, Workout, ChartDefinition, ChartXAxisMode, AggregationFunction } from "../types";
import { FIELD_MAP } from "./fields";

export const SERIES_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706",
  "#7c3aed", "#db2777", "#0d9488", "#ea580c",
];

export function seriesColor(index: number, custom?: string | null): string {
  return custom ?? SERIES_COLORS[index % SERIES_COLORS.length];
}

export interface PowerZone {
  zone: string;
  minPct: number;
  maxPct: number;
  color: string;
}

export interface InstructorCue {
  startSecond: number;
  endSecond: number;
  zone: number;
}

export const POWER_ZONES: PowerZone[] = [
  { zone: "Z1", minPct: 0, maxPct: 0.55, color: "#6baed6" },
  { zone: "Z2", minPct: 0.55, maxPct: 0.75, color: "#31b5c4" },
  { zone: "Z3", minPct: 0.75, maxPct: 0.90, color: "#4daf4a" },
  { zone: "Z4", minPct: 0.90, maxPct: 1.05, color: "#f0c928" },
  { zone: "Z5", minPct: 1.05, maxPct: 1.20, color: "#ff7f00" },
  { zone: "Z6", minPct: 1.20, maxPct: 1.50, color: "#e41a1c" },
  { zone: "Z7", minPct: 1.50, maxPct: 2.50, color: "#8b0000" },
];

/**
 * Parse the raw performance_graph JSON into per-second time series arrays.
 * Returns null if output data is missing or empty.
 */
export function parsePerformanceGraph(rawJson: string): PerformanceTimeSeries | null {
  try {
    const data = JSON.parse(rawJson);
    const metrics = data.metrics ?? data.segment_list?.[0]?.metrics ?? [];

    const findValues = (slug: string): number[] => {
      const metric = metrics.find((m: { slug?: string }) => m.slug === slug);
      return metric?.values ?? [];
    };

    const output = findValues("output");
    if (output.length === 0) return null;

    const seconds = output.map((_: number, i: number) => i);

    return {
      seconds,
      output,
      cadence: findValues("cadence"),
      resistance: findValues("resistance"),
      heartRate: findValues("heart_rate"),
      speed: findValues("speed"),
    };
  } catch {
    return null;
  }
}

/**
 * Check if a workout is a Power Zone ride.
 * Prefers `is_power_zone_ride` from ride details (available after enrichment),
 * falls back to title-based `class_type` before enrichment.
 */
export function isPowerZoneRide(workout: { class_type: string | null; raw_ride_details_json: string | null }): boolean {
  if (workout.class_type === "Power Zone") return true;
  if (workout.raw_ride_details_json) {
    try {
      const data = JSON.parse(workout.raw_ride_details_json);
      if (data.is_power_zone_class === true) return true;
    } catch { /* fall through */ }
  }
  return false;
}

/**
 * Extract the pedaling start offset from raw ride details JSON.
 * This is the number of seconds from ride/video start until pedaling begins.
 */
export function parsePedalingStartOffset(rawRideDetailsJson: string | null | undefined): number {
  if (!rawRideDetailsJson) return 0;
  try {
    const data = JSON.parse(rawRideDetailsJson);
    return data.ride?.pedaling_start_offset ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Parse target_metrics_performance_data from raw performance graph JSON.
 * Returns target metric intervals for power zone segments, or null if none found.
 * pedalingStartOffset adjusts offsets from ride/video start to pedaling start.
 */
export function parseTargetMetrics(rawPerformanceGraphJson: string, pedalingStartOffset = 0): InstructorCue[] | null {
  try {
    const data = JSON.parse(rawPerformanceGraphJson);
    const targets = data.target_metrics_performance_data?.target_metrics;
    if (!Array.isArray(targets)) return null;

    const parsed: InstructorCue[] = [];
    for (const t of targets) {
      if (t.segment_type !== "power_zone") continue;
      const zone = t.metrics?.[0]?.upper;
      if (zone == null || !t.offsets) continue;
      parsed.push({
        startSecond: t.offsets.start - pedalingStartOffset,
        endSecond: t.offsets.end - pedalingStartOffset,
        zone,
      });
    }

    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

interface ChartOptions {
  width?: number;
  height?: number;
  durationSeconds?: number;
  overlays?: { output?: boolean; heartRate?: boolean; cadence?: boolean; resistance?: boolean; speed?: boolean };
  overlayColors?: { output?: string; heartRate?: string; cadence?: string; resistance?: string; speed?: string };
  cueColor?: string;
  showZoneBands?: boolean;
  showInstructorCues?: boolean;
  showYAxis?: boolean;
  darkBackground?: boolean;
}

/**
 * Render a single-ride detail chart with output line and optional power zone bands.
 * Returns an SVG/HTML element to mount in the DOM.
 */
export function renderRideDetailChart(
  timeSeries: PerformanceTimeSeries,
  ftp: number | null,
  options: ChartOptions = {},
  cues?: InstructorCue[] | null,
): SVGElement | HTMLElement {
  const { width = 800, height = 300 } = options;

  const maxOutput = Math.max(...timeSeries.output);
  const yMax = ftp != null
    ? Math.max(maxOutput * 1.1, ftp * 1.5)
    : maxOutput * 1.1;

  const data = timeSeries.seconds.map((s, i) => ({
    second: s,
    output: timeSeries.output[i],
    heartRate: timeSeries.heartRate[i] ?? 0,
    cadence: timeSeries.cadence[i] ?? 0,
    resistance: timeSeries.resistance[i] ?? 0,
    speed: timeSeries.speed[i] ?? 0,
  }));

  const marks: Plot.Markish[] = [];

  // Zone bands (only if FTP is available)
  if (options.showZoneBands !== false && ftp != null) {
    const zoneBands = POWER_ZONES.map((z) => ({
      y1: z.minPct * ftp,
      y2: Math.min(z.maxPct * ftp, yMax),
      fill: z.color,
      zone: z.zone,
    }));

    marks.push(
      Plot.rect(zoneBands, {
        x1: 0,
        x2: timeSeries.seconds.length - 1,
        y1: "y1",
        y2: "y2",
        fill: "fill",
        fillOpacity: 0.2,
      }),
    );

    // Zone labels on the right (always shown when bands are shown)
    {
      const zoneLabels = POWER_ZONES.filter((z) => z.minPct * ftp < yMax).map((z) => ({
        y: ((z.minPct + Math.min(z.maxPct, yMax / ftp)) / 2) * ftp,
        text: z.zone,
      }));

      marks.push(
        Plot.text(zoneLabels, {
          x: timeSeries.seconds.length - 1,
          y: "y",
          text: "text",
          textAnchor: "start",
          dx: 8,
          fontSize: 10,
          fill: options.darkBackground ? "rgba(255,255,255,0.8)" : "#666",
        }),
      );
    }
  }

  // Class plan overlay (instructor cues)
  if (options.showInstructorCues !== false && ftp != null && cues && cues.length > 0) {
    const cueColor = options.cueColor ?? "#333";

    const cueSegments = cues.map((c) => {
      const pz = POWER_ZONES[c.zone - 1];
      if (!pz) return null;
      const yVal = ((pz.minPct + pz.maxPct) / 2) * ftp;
      return { x1: c.startSecond, x2: c.endSecond, y: yVal, zone: c.zone, duration: c.endSecond - c.startSecond };
    }).filter((s): s is NonNullable<typeof s> => s != null);

    // Horizontal line segments
    marks.push(
      Plot.link(cueSegments, {
        x1: "x1",
        x2: "x2",
        y1: "y",
        y2: "y",
        stroke: cueColor,
        strokeOpacity: 0.5,
        strokeWidth: 2,
      }),
    );

    // Vertical connectors between adjacent cues
    const verticals: { x: number; y1: number; y2: number }[] = [];
    for (let i = 0; i < cueSegments.length - 1; i++) {
      const curr = cueSegments[i];
      const next = cueSegments[i + 1];
      if (curr.y !== next.y) {
        verticals.push({ x: next.x1, y1: curr.y, y2: next.y });
      }
    }

    if (verticals.length > 0) {
      marks.push(
        Plot.link(verticals, {
          x1: "x",
          x2: "x",
          y1: "y1",
          y2: "y2",
          stroke: cueColor,
          strokeOpacity: 0.5,
          strokeWidth: 2,
        }),
      );
    }
  }

  // Output line
  if (options.overlays?.output !== false) {
    marks.push(
      Plot.lineY(data, {
        x: "second",
        y: "output",
        stroke: options.overlayColors?.output ?? "#e44",
        strokeWidth: 1.5,
      }),
    );
  }

  // Additional overlay lines (HR, cadence, resistance) mapped to the output Y domain
  type OverlayKey = "heartRate" | "cadence" | "resistance" | "speed";
  const overlayDefs: { key: OverlayKey; field: string; defaultColor: string; values: number[] }[] = [
    { key: "heartRate", field: "heartRate", defaultColor: "#e91e63", values: timeSeries.heartRate },
    { key: "cadence", field: "cadence", defaultColor: "#2196f3", values: timeSeries.cadence },
    { key: "resistance", field: "resistance", defaultColor: "#4caf50", values: timeSeries.resistance },
    { key: "speed", field: "speed", defaultColor: "#ff9800", values: timeSeries.speed },
  ];

  for (const overlay of overlayDefs) {
    if (!options.overlays?.[overlay.key]) continue;
    if (overlay.values.length === 0) continue;

    const overlayMax = Math.max(...overlay.values);
    if (overlayMax === 0) continue;

    // Map overlay values into the output Y domain
    const scale = scaleLinear().domain([0, overlayMax]).range([0, yMax * 0.8]);
    const mappedData = data.map((d) => ({
      second: d.second,
      value: scale(d[overlay.field as keyof typeof d] as number),
    }));

    marks.push(
      Plot.lineY(mappedData, {
        x: "second",
        y: "value",
        stroke: options.overlayColors?.[overlay.key] ?? overlay.defaultColor,
        strokeWidth: 1.5,
        strokeOpacity: 0.7,
      }),
    );
  }

  const totalSeconds = timeSeries.seconds.length;
  const xMax = options.durationSeconds ?? totalSeconds;
  const tickInterval = xMax <= 600 ? 60 : xMax <= 1800 ? 300 : 600;
  const ticks = Array.from({ length: Math.floor(xMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
  if (xMax % tickInterval !== 0) ticks.push(xMax);

  const plot = Plot.plot({
    width,
    height,
    marginRight: 36,
    x: {
      label: null,
      domain: [0, xMax],
      ticks,
      tickFormat: (d: number) => {
        const m = Math.floor(d / 60);
        return `${m}m`;
      },
    },
    y: {
      domain: [0, yMax],
      label: options.showYAxis !== false ? "Watts" : null,
      grid: options.showYAxis !== false,
      ticks: options.showYAxis !== false ? undefined : [],
    },
    marks,
  });

  if (options.darkBackground) {
    // Restyle axis text and grid for light-on-dark
    plot.querySelectorAll("text").forEach((el) => {
      el.setAttribute("fill", "rgba(255,255,255,0.85)");
    });
    plot.querySelectorAll("[aria-label='y-axis tick'] line, [aria-label='x-axis tick'] line").forEach((el) => {
      el.setAttribute("stroke", "rgba(255,255,255,0.3)");
    });
    // Grid lines
    plot.querySelectorAll("g[aria-label='y-axis grid'] line").forEach((el) => {
      el.setAttribute("stroke", "rgba(255,255,255,0.15)");
    });
  }

  return plot;
}

// --- Custom chart rendering ---

interface WorkoutPoint {
  date: Date;
  label?: string;
  ys: number[];
  group?: string;
  _workout?: Workout;
}

// --- Aggregation helpers ---

export function isAggregatedMode(mode: ChartXAxisMode): boolean {
  return mode !== "date";
}

function isTemporalAggregation(mode: ChartXAxisMode): boolean {
  return mode === "day" || mode === "week" || mode === "month" || mode === "year";
}

function getTemporalBucketKey(date: Date, mode: ChartXAxisMode): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  switch (mode) {
    case "day":
      return `${y}-${m}-${d}`;
    case "week": {
      // ISO week: find Monday of the week
      const day = date.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const monday = new Date(date);
      monday.setDate(monday.getDate() + diff);
      const wy = monday.getFullYear();
      const wm = String(monday.getMonth() + 1).padStart(2, "0");
      const wd = String(monday.getDate()).padStart(2, "0");
      return `${wy}-${wm}-${wd}`;
    }
    case "month":
      return `${y}-${m}`;
    case "year":
      return `${y}`;
    default:
      return `${y}-${m}-${d}`;
  }
}

function bucketKeyToDate(key: string, mode: ChartXAxisMode): Date {
  switch (mode) {
    case "day":
      return new Date(key + "T12:00:00");
    case "week":
      // key is the Monday date; use mid-week (Thursday) as representative
      { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + 3); return d; }
    case "month":
      return new Date(key + "-15T12:00:00");
    case "year":
      return new Date(key + "-07-01T12:00:00");
    default:
      return new Date(key);
  }
}

function formatBucketLabel(key: string, mode: ChartXAxisMode): string {
  switch (mode) {
    case "day": {
      const d = new Date(key + "T12:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    }
    case "week": {
      // key is Monday date e.g. "2024-03-11" → "Mar 11 '24"
      const d = new Date(key + "T12:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    }
    case "month": {
      const d = new Date(key + "-15T12:00:00");
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    case "year":
      return key;
    default:
      return key;
  }
}

/** Approximate character width of labels for a given mode. */
const LABEL_CHAR_WIDTH: Record<string, number> = {
  day: 11,   // "Mar 11 '24"
  week: 11,  // "Mar 11 '24"
  month: 8,  // "Mar '24"
  year: 4,   // "2024"
};

function aggregate(values: number[], fn: AggregationFunction): number {
  if (values.length === 0) return 0;
  switch (fn) {
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "count":
      return values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

const AGG_LABEL: Record<AggregationFunction, string> = {
  avg: "Avg",
  sum: "Sum",
  count: "Count",
  min: "Min",
  max: "Max",
};

const TEMPORAL_BAR_HALF_WIDTH: Record<string, number> = {
  day: 12 * 60 * 60 * 1000,           // 12 hours
  week: 3.5 * 24 * 60 * 60 * 1000,    // 3.5 days
  month: 15 * 24 * 60 * 60 * 1000,    // 15 days
  year: 182 * 24 * 60 * 60 * 1000,    // ~6 months
};

/** Fields whose raw DB values need scaling for display. */
const FIELD_DISPLAY_SCALE: Record<string, number> = {
  total_work: 1 / 1000, // joules → kj
};

function scaleValue(field: string, value: number): number {
  const scale = FIELD_DISPLAY_SCALE[field];
  return scale ? Math.round(value * scale) : value;
}

function extractRawPoints(
  workouts: Workout[],
  chart: ChartDefinition,
): WorkoutPoint[] {
  if (chart.y_fields.length === 0) return [];
  const fieldKeys = chart.y_fields.map((f) => f.field);

  const points: WorkoutPoint[] = [];
  for (const w of workouts) {
    const rec = w as unknown as Record<string, unknown>;
    // Require at least the first field to be non-null
    const firstVal = rec[fieldKeys[0]];
    if (firstVal == null) continue;
    const ys: number[] = [];
    for (const key of fieldKeys) {
      const v = rec[key];
      ys.push(v != null ? scaleValue(key, v as number) : NaN);
    }
    const point: WorkoutPoint = {
      date: new Date(w.date * 1000),
      ys,
      _workout: w,
    };
    if (chart.group_by) {
      const raw = String(rec[chart.group_by] ?? "Unknown");
      const displayFn = FIELD_MAP[chart.group_by]?.displayValue;
      point.group = displayFn ? displayFn(raw) : raw;
    }
    points.push(point);
  }
  return points;
}

function prepareChartData(
  workouts: Workout[],
  chart: ChartDefinition,
): WorkoutPoint[] {
  const points = extractRawPoints(workouts, chart);
  if (points.length === 0) return [];

  // Non-aggregated mode (date): return raw points
  if (!isAggregatedMode(chart.x_axis_mode)) {
    if (chart.x_axis_sequential) {
      assignSequentialLabels(points);
    }
    return points;
  }

  const fn = chart.agg_function ?? "avg";

  const fieldCount = chart.y_fields.length;

  // Group points into buckets
  // Compound key: bucketKey + group (if group_by is set)
  const buckets = new Map<string, { ysValues: number[][]; date: Date; label: string; group?: string }>();

  for (const p of points) {
    let bucketKey: string;
    let bucketLabel: string;
    let bucketDate: Date;

    if (isTemporalAggregation(chart.x_axis_mode)) {
      bucketKey = getTemporalBucketKey(p.date, chart.x_axis_mode);
      bucketLabel = formatBucketLabel(bucketKey, chart.x_axis_mode);
      bucketDate = bucketKeyToDate(bucketKey, chart.x_axis_mode);
    } else {
      // category mode
      const w = p._workout!;
      const field = chart.x_axis_field;
      if (!field) continue;
      const raw = String((w as unknown as Record<string, unknown>)[field] ?? "Unknown");
      const displayFn = FIELD_MAP[field]?.displayValue;
      bucketKey = raw;
      bucketLabel = displayFn ? displayFn(raw) : raw;
      bucketDate = new Date(0); // not used for categorical
    }

    // Include group in compound key
    const compoundKey = p.group != null ? `${bucketKey}\0${p.group}` : bucketKey;

    let bucket = buckets.get(compoundKey);
    if (!bucket) {
      bucket = { ysValues: Array.from({ length: fieldCount }, () => []), date: bucketDate, label: bucketLabel, group: p.group };
      buckets.set(compoundKey, bucket);
    }
    for (let fi = 0; fi < fieldCount; fi++) {
      const v = p.ys[fi];
      if (!isNaN(v)) bucket.ysValues[fi].push(v);
    }
  }

  // Aggregate and produce output points
  const result: WorkoutPoint[] = [];
  for (const bucket of buckets.values()) {
    const ys: number[] = [];
    for (let fi = 0; fi < fieldCount; fi++) {
      ys.push(bucket.ysValues[fi].length > 0 ? aggregate(bucket.ysValues[fi], fn) : NaN);
    }
    result.push({
      date: bucket.date,
      label: bucket.label,
      ys,
      group: bucket.group,
    });
  }

  // HAVING-like filter: drop buckets below min_value (based on first field)
  if (chart.min_value != null) {
    const min = chart.min_value;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].ys[0] < min) result.splice(i, 1);
    }
  }

  // Sort: temporal by date, categorical by numeric prefix then alphabetically
  if (isTemporalAggregation(chart.x_axis_mode)) {
    result.sort((a, b) => a.date.getTime() - b.date.getTime());
  } else {
    result.sort((a, b) => {
      const aLabel = a.label ?? "";
      const bLabel = b.label ?? "";
      const aNum = parseFloat(aLabel);
      const bNum = parseFloat(bLabel);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aLabel.localeCompare(bLabel);
    });
  }

  return result;
}

/** Assign sequential categorical labels to raw (non-aggregated) points. */
function assignSequentialLabels(points: WorkoutPoint[]) {
  const seen = new Map<string, number>();
  for (const p of points) {
    const base = p.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    p.label = n > 1 ? `${base} #${n}` : base;
  }
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function fieldLabel(fieldKey: string): string {
  return FIELD_MAP[fieldKey]?.label ?? fieldKey;
}

function tooltipTitle(d: WorkoutPoint, yFieldKey: string, chart: ChartDefinition, yValue: number): string {
  const xLabel = d.label ?? d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const val = yValue;
  const rounded = Number.isInteger(val) ? val : +val.toFixed(2);
  const aggregated = isAggregatedMode(chart.x_axis_mode);
  const isCount = aggregated && chart.agg_function === "count";
  const prefix = aggregated && chart.agg_function && !isCount ? `${AGG_LABEL[chart.agg_function]} ` : "";
  const metric = isCount ? "Count" : `${prefix}${fieldLabel(yFieldKey)}`;
  let text = `${xLabel}\n${metric}: ${rounded}`;
  if (d.group) text += `\n${d.group}`;
  return text;
}

/** Extract unique group names from data, sorted numerically when possible. */
function sortedGroups(data: WorkoutPoint[]): string[] {
  const groups = [...new Set(data.map((d) => d.group).filter((g): g is string => g != null))];
  groups.sort((a, b) => {
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
  return groups;
}

const MAX_X_TICKS = 20;

function workoutXConfig(data: WorkoutPoint[], showAllTicks = false, chartWidth = 0): Record<string, unknown> {
  const domain = data.map((d) => d.label);
  const n = domain.length;
  const cfg: Record<string, unknown> = {
    label: null,
    domain,
    tickFormat: (d: string) => d.replace(/ #\d+$/, ""),
  };

  // Estimate how many labels fit side-by-side (~7px per char + 12px gap)
  const maxLabelLen = domain.reduce((mx, l) => Math.max(mx, (l ?? "").replace(/ #\d+$/, "").length), 0);
  const labelPx = maxLabelLen * 7 + 12;
  const usableWidth = chartWidth > 0 ? chartWidth - 80 : 0;
  const fitCount = usableWidth > 0 ? Math.max(4, Math.floor(usableWidth / labelPx)) : MAX_X_TICKS;
  const maxTicks = Math.min(MAX_X_TICKS, fitCount);

  if (showAllTicks) {
    if (n > maxTicks) cfg.tickRotate = -45;
  } else if (n > maxTicks) {
    const step = Math.ceil(n / maxTicks);
    cfg.ticks = domain.filter((_, i) => i % step === 0);
    cfg.tickRotate = -45;
  }
  return cfg;
}

/** Build x-axis config for temporal aggregation modes (ticks at bar centers). */
/**
 * Generate evenly-spaced calendar ticks across a date range.
 * Uses the same bucket key → date pipeline as the data points
 * so ticks land exactly on bar centers.
 */
function generateCalendarTicks(minDate: Date, maxDate: Date, mode: ChartXAxisMode, maxTicks: number): Date[] {
  // Step a cursor through calendar units, converting each to the
  // canonical bucket-center date via the same path used for data.
  const cursor = new Date(minDate);
  // Align cursor to start of the first bucket period
  switch (mode) {
    case "day":
      cursor.setHours(0, 0, 0, 0);
      break;
    case "week": {
      const day = cursor.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      cursor.setDate(cursor.getDate() + diff);
      cursor.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      cursor.setDate(1); cursor.setHours(0, 0, 0, 0);
      break;
    case "year":
      cursor.setMonth(0, 1); cursor.setHours(0, 0, 0, 0);
      break;
  }

  const allDates: Date[] = [];
  const endTime = maxDate.getTime();
  while (true) {
    const key = getTemporalBucketKey(cursor, mode);
    const center = bucketKeyToDate(key, mode);
    if (center.getTime() > endTime) break;
    allDates.push(center);
    // Advance cursor by one period
    switch (mode) {
      case "day": cursor.setDate(cursor.getDate() + 1); break;
      case "week": cursor.setDate(cursor.getDate() + 7); break;
      case "month": cursor.setMonth(cursor.getMonth() + 1); break;
      case "year": cursor.setFullYear(cursor.getFullYear() + 1); break;
    }
  }

  if (allDates.length <= maxTicks) return allDates;

  // Pick evenly spaced subset
  const step = Math.ceil(allDates.length / maxTicks);
  const ticks: Date[] = [];
  for (let i = 0; i < allDates.length; i += step) {
    ticks.push(allDates[i]);
  }
  return ticks;
}

/** Build x-axis config for temporal aggregation modes (ticks at regular calendar intervals). */
function temporalAggXConfig(data: WorkoutPoint[], mode: ChartXAxisMode, chartWidth: number): Record<string, unknown> {
  // Find date range from data
  let minTime = Infinity, maxTime = -Infinity;
  for (const d of data) {
    const t = d.date.getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }
  const minDate = new Date(minTime);
  const maxDate = new Date(maxTime);

  // Estimate how many labels fit horizontally (~7px per char + 12px gap)
  const charWidth = LABEL_CHAR_WIDTH[mode] ?? 10;
  const labelPx = charWidth * 7 + 12;
  const usableWidth = chartWidth - 80; // margins
  const maxTicks = Math.max(4, Math.floor(usableWidth / labelPx));

  const tickDates = generateCalendarTicks(minDate, maxDate, mode, maxTicks);

  const cfg: Record<string, unknown> = {
    label: null,
    type: "utc",
    ticks: tickDates,
    tickFormat: (d: Date) => {
      const key = getTemporalBucketKey(d, mode);
      return formatBucketLabel(key, mode);
    },
  };
  if (tickDates.length >= maxTicks) cfg.tickRotate = -45;
  return cfg;
}

/** Compute a rolling average over data points for a specific field index. Returns points with ys[0] = smoothed value. */
function computeRollingAverage(data: WorkoutPoint[], windowSize: number, fieldIndex: number): { date: Date; label?: string; y: number }[] {
  const result: { date: Date; label?: string; y: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0, count = 0;
    for (let j = start; j <= i; j++) {
      const v = data[j].ys[fieldIndex];
      if (!isNaN(v)) { sum += v; count++; }
    }
    result.push({ date: data[i].date, label: data[i].label, y: count > 0 ? sum / count : 0 });
  }
  return result;
}

/** Render a chart with N Y-axis fields, each independently scaled. */
export function renderChart(
  workouts: Workout[],
  chart: ChartDefinition,
  width = 800,
  height = 400,
): SVGElement | HTMLElement {
  const data = prepareChartData(workouts, chart);
  const yField = chart.y_fields[0];
  if (!yField || data.length === 0) {
    return Plot.plot({ width, height, marks: [] });
  }

  const aggregated = isAggregatedMode(chart.x_axis_mode);
  const temporal = isTemporalAggregation(chart.x_axis_mode);
  const categorical = chart.x_axis_mode === "category" || chart.x_axis_sequential;
  const xKey = categorical ? "label" : "date";
  const multiField = chart.y_fields.length >= 2 && !chart.group_by;

  // --- Determine the primary field (first left-side, or field[0]) ---
  const primaryIndex = chart.y_fields.findIndex((f) => f.side === "left");
  const primaryIdx = primaryIndex >= 0 ? primaryIndex : 0;

  // --- Compute extents and scaling for each field ---
  const fieldExtents: [number, number][] = chart.y_fields.map((_, fi) => {
    const vals = data.map((d) => d.ys[fi]).filter((v) => !isNaN(v));
    const ext = extent(vals) as [number, number];
    return ext[0] != null ? ext : [0, 1];
  });
  const primaryExtent = fieldExtents[primaryIdx];

  // Scale functions: map field[i] values into the primary extent for plotting
  const fieldScales: ((v: number) => number)[] = chart.y_fields.map((_, fi) => {
    if (fi === primaryIdx) return (v: number) => v;
    const ext = fieldExtents[fi];
    if (ext[0] === ext[1]) return () => (primaryExtent[0] + primaryExtent[1]) / 2;
    const s = scaleLinear().domain(ext).range(primaryExtent);
    return (v: number) => s(v);
  });

  // --- Build per-field flat data arrays (mapped into primary space) ---
  interface FlatPoint {
    date: Date;
    label?: string;
    y: number;          // mapped into primary extent
    originalY: number;  // real value for tooltip
    group?: string;
    _workout?: Workout;
  }
  const fieldData: FlatPoint[][] = chart.y_fields.map((_, fi) =>
    data
      .filter((d) => !isNaN(d.ys[fi]))
      .map((d) => ({
        date: d.date,
        label: d.label,
        y: fieldScales[fi](d.ys[fi]),
        originalY: d.ys[fi],
        group: d.group,
        _workout: d._workout,
      })),
  );

  // --- For single-field + group_by, use the old color="group" approach ---
  const singleFieldGrouped = chart.y_fields.length === 1 && !!chart.group_by;
  const singleColor = singleFieldGrouped ? "group" : seriesColor(0, yField.color);

  // --- Marks ---
  const chartMarks: Plot.Markish[] = [];
  const halfWidth = (temporal && TEMPORAL_BAR_HALF_WIDTH[chart.x_axis_mode]) || HALF_DAY_MS;
  const transposed = chart.transposed && chart.mark_type === "bar" && categorical;

  // For grouped bars (single field + group_by), build a combined tooltip
  let groupedBarTitleFn: ((d: FlatPoint) => string) | undefined;
  if (chart.mark_type === "bar" && singleFieldGrouped) {
    const groupsByX = new Map<string, { group: string; y: number }[]>();
    for (const d of fieldData[0]) {
      const key = d.label ?? d.date.toISOString();
      if (!groupsByX.has(key)) groupsByX.set(key, []);
      groupsByX.get(key)!.push({ group: d.group ?? "Unknown", y: d.originalY });
    }
    for (const groups of groupsByX.values()) {
      groups.sort((a, b) => {
        const aNum = parseFloat(a.group);
        const bNum = parseFloat(b.group);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.group.localeCompare(b.group);
      });
    }
    const isCount = aggregated && chart.agg_function === "count";
    const prefix = aggregated && chart.agg_function && !isCount ? `${AGG_LABEL[chart.agg_function]} ` : "";
    const metricLabel = isCount ? "Count" : `${prefix}${fieldLabel(yField.field)}`;
    groupedBarTitleFn = (d: FlatPoint) => {
      const key = d.label ?? d.date.toISOString();
      const groups = groupsByX.get(key) ?? [];
      const xLabel = d.label ?? d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
      let text = `${xLabel}\n${metricLabel}`;
      for (const g of groups) {
        const rounded = Number.isInteger(g.y) ? g.y : +g.y.toFixed(2);
        text += `\n${g.group}: ${rounded}`;
      }
      return text;
    };
  }

  // Helper: add marks for one field
  const addFieldMarks = (fi: number) => {
    const fd = fieldData[fi];
    const yf = chart.y_fields[fi];
    const color = seriesColor(fi, yf.color);
    const isPrimary = fi === primaryIdx;
    const opacity = isPrimary || chart.y_fields.length === 1 ? 0.8 : 0.5;
    const titleFn = (d: FlatPoint) => tooltipTitle(d as unknown as WorkoutPoint, yf.field, chart, d.originalY);
    const pointTip = { tip: { anchor: "bottom" as const, dy: -6 }, title: titleFn };

    if (chart.mark_type === "bar") {
      const barTip = groupedBarTitleFn && fi === 0 ? { tip: true, title: groupedBarTitleFn } : {};
      const fillColor = singleFieldGrouped ? singleColor : color;
      if (categorical) {
        if (transposed) {
          chartMarks.push(Plot.barX(fd, {
            y: "label", x: "y", fill: fillColor,
            ...(singleFieldGrouped ? {} : { fillOpacity: opacity }),
            sort: { y: "x", reverse: true },
            ...barTip,
          }));
        } else {
          chartMarks.push(Plot.barY(fd, {
            x: "label", y: "y", fill: fillColor,
            ...(singleFieldGrouped ? {} : { fillOpacity: opacity }),
            ...barTip,
          }));
        }
      } else {
        const barData = fd.map((d) => ({
          ...d,
          x1: new Date(d.date.getTime() - halfWidth),
          x2: new Date(d.date.getTime() + halfWidth),
        }));
        chartMarks.push(Plot.rectY(barData, {
          x1: "x1", x2: "x2", y: "y", fill: fillColor,
          ...(singleFieldGrouped ? {} : { fillOpacity: opacity }),
          ...barTip,
        }));
      }
      if (!singleFieldGrouped) {
        chartMarks.push(Plot.tip(fd, Plot.pointer({
          x: transposed ? "y" : xKey,
          y: transposed ? "label" : "y",
          anchor: transposed ? "left" : "bottom",
          ...(transposed ? { dx: -6 } : { dy: -6 }),
          title: titleFn,
        })));
      }
    } else if (chart.mark_type === "dot") {
      chartMarks.push(Plot.dot(fd, { x: xKey, y: "y", stroke: singleFieldGrouped ? singleColor : color, fill: singleFieldGrouped ? singleColor : color, r: 3, ...pointTip }));
    } else {
      chartMarks.push(Plot.lineY(fd, {
        x: xKey, y: "y", stroke: singleFieldGrouped ? singleColor : color, strokeWidth: 1.5,
        ...(singleFieldGrouped ? { sort: xKey } : {}),
        ...(multiField && fi !== primaryIdx ? { strokeDasharray: "4 2" } : {}),
        ...pointTip,
      }));
    }
  };

  // --- Stacked bar mode ---
  const useStacked = chart.stacked && chart.mark_type === "bar" && chart.y_fields.length >= 2 && !chart.group_by;

  if (useStacked) {
    // Transform wide WorkoutPoint[] into long format for Plot.stackY
    interface LongPoint {
      date: Date;
      label?: string;
      x1?: Date;
      x2?: Date;
      value: number;
      series: string;
    }
    const longData: LongPoint[] = [];
    for (const d of data) {
      for (let fi = 0; fi < chart.y_fields.length; fi++) {
        const v = d.ys[fi];
        if (isNaN(v)) continue;
        const yf = chart.y_fields[fi];
        const point: LongPoint = {
          date: d.date,
          label: d.label,
          value: v,
          series: fieldLabel(yf.field),
        };
        if (!categorical) {
          point.x1 = new Date(d.date.getTime() - halfWidth);
          point.x2 = new Date(d.date.getTime() + halfWidth);
        }
        longData.push(point);
      }
    }

    // Tooltip for stacked segments
    const stackTitleFn = (d: LongPoint) => {
      const xLabel = d.label ?? d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
      const rounded = Number.isInteger(d.value) ? d.value : +d.value.toFixed(1);
      return `${xLabel}\n${d.series}: ${rounded}`;
    };

    if (categorical) {
      chartMarks.push(Plot.barY(longData, Plot.stackY({
        x: "label", y: "value", fill: "series",
        title: stackTitleFn, tip: true,
      })));
    } else {
      chartMarks.push(Plot.rectY(longData, Plot.stackY({
        x1: "x1", x2: "x2", y: "value", fill: "series",
        title: stackTitleFn, tip: true,
      })));
    }
  } else {
    // Add marks for all fields (normal mode)
    for (let fi = 0; fi < chart.y_fields.length; fi++) {
      addFieldMarks(fi);
    }
  }

  // Single-field grouped bar tip
  if (chart.mark_type === "bar" && singleFieldGrouped) {
    const fd = fieldData[0];
    const titleFn = (d: FlatPoint) => tooltipTitle(d as unknown as WorkoutPoint, yField.field, chart, d.originalY);
    chartMarks.push(Plot.tip(fd, Plot.pointer({
      x: transposed ? "y" : xKey,
      y: transposed ? "label" : "y",
      anchor: transposed ? "left" : "bottom",
      ...(transposed ? { dx: -6 } : { dy: -6 }),
      title: titleFn,
    })));
  }

  // --- Trend line overlays ---
  const canTrend = (chart.mark_type === "line" || chart.mark_type === "dot") &&
    chart.x_axis_mode !== "category" && !chart.group_by && data.length > 1;

  if (canTrend) {
    for (let fi = 0; fi < chart.y_fields.length; fi++) {
      const yf = chart.y_fields[fi];
      if (!yf.trend_line) continue;
      const windowSize = yf.trend_line_window ?? 7;
      const smoothed = computeRollingAverage(data, windowSize, fi);
      // Map into primary extent
      const mappedSmoothed = smoothed.map((d) => ({
        ...d,
        y: fieldScales[fi](d.y),
      }));
      const color = seriesColor(fi, yf.color);
      chartMarks.push(Plot.lineY(mappedSmoothed, {
        x: xKey, y: "y",
        stroke: color, strokeWidth: 2, strokeOpacity: 0.6, strokeDasharray: "6 3",
      }));
    }
  }

  // --- Right-side axis ticks (for fields on the right side) ---
  const hasRightFields = multiField && chart.y_fields.some((f) => f.side === "right");
  if (hasRightFields) {
    // Use the first right-side field for tick labels
    const firstRightIdx = chart.y_fields.findIndex((f) => f.side === "right");
    const rightExt = fieldExtents[firstRightIdx];
    const rightColor = seriesColor(firstRightIdx, chart.y_fields[firstRightIdx].color);
    const primaryToRight = scaleLinear().domain(primaryExtent).range(rightExt);
    const tickCount = 6;
    const step = (primaryExtent[1] - primaryExtent[0]) / (tickCount - 1);
    const maxXVal = categorical
      ? data[data.length - 1]?.label
      : data.reduce((max, d) => (d.date > max ? d.date : max), data[0].date);
    const rightTicks = Array.from({ length: tickCount }, (_, i) => {
      const pVal = primaryExtent[0] + i * step;
      return { x: maxXVal, y: pVal, label: Math.round(primaryToRight(pVal)).toString() };
    });
    chartMarks.push(Plot.text(rightTicks, {
      x: "x", y: "y", text: "label",
      textAnchor: "start", dx: 8, fontSize: 10, fill: rightColor,
    }));
  }

  // --- X-axis config ---
  const isCategoryMode = chart.x_axis_mode === "category";
  const xConfig: Record<string, unknown> = categorical
    ? workoutXConfig(data, isCategoryMode, width)
    : temporal
      ? temporalAggXConfig(data, chart.x_axis_mode, width)
      : { label: null, type: "utc" };

  // --- Y-axis label ---
  let yLabel = fieldLabel(chart.y_fields[primaryIdx].field);
  if (aggregated && chart.agg_function) {
    yLabel = chart.agg_function === "count" ? "Count" : `${AGG_LABEL[chart.agg_function]} ${yLabel}`;
  }

  // --- Margin ---
  let marginLeft: number | undefined;
  if (transposed) {
    const maxLen = Math.max(...data.map((d) => (d.label ?? "").length));
    marginLeft = Math.min(200, maxLen * 7 + 20);
  }
  const marginRight = hasRightFields ? 70 : 40;

  // --- Color config for stacked mode ---
  const stackedColorDomain = useStacked ? chart.y_fields.map((yf) => fieldLabel(yf.field)) : undefined;
  const stackedColorRange = useStacked ? chart.y_fields.map((yf, fi) => seriesColor(fi, yf.color)) : undefined;

  // --- Caption: list all field labels with colors when multi-field ---
  let caption: string | undefined;
  if (multiField && !useStacked) {
    const parts = chart.y_fields.map((yf, fi) => {
      let label = fieldLabel(yf.field);
      if (aggregated && chart.agg_function) {
        label = chart.agg_function === "count" ? "Count" : `${AGG_LABEL[chart.agg_function]} ${label}`;
      }
      const color = seriesColor(fi, yf.color);
      return `<span style="color:${color}">●</span> ${label}${yf.side === "right" ? " (R)" : ""}`;
    });
    caption = parts.join("  ");
  }

  const colorConfig = useStacked
    ? { legend: true, domain: stackedColorDomain, range: stackedColorRange }
    : singleFieldGrouped
      ? { legend: true, domain: sortedGroups(data) }
      : undefined;

  const plotConfig = transposed
    ? {
        width, height, marginLeft, marginRight,
        x: { label: yLabel, grid: true } as Record<string, unknown>,
        y: { ...xConfig, tickRotate: 0, label: null } as Record<string, unknown>,
        color: colorConfig,
        marks: chartMarks,
      }
    : {
        width, height: useStacked ? height - 30 : height, marginRight,
        marginBottom: (xConfig as Record<string, unknown>).tickRotate || useStacked ? 60 : undefined,
        x: xConfig,
        y: { label: useStacked ? "%" : yLabel, grid: true, ...(multiField && !useStacked ? { domain: primaryExtent } : {}) },
        color: colorConfig,
        marks: chartMarks,
      };

  const svg = Plot.plot(plotConfig);

  // Inject HTML caption if multi-field
  if (caption) {
    const figcaption = svg.querySelector("figcaption");
    if (figcaption) {
      figcaption.innerHTML = caption;
    } else {
      const cap = document.createElement("figcaption");
      cap.innerHTML = caption;
      cap.style.cssText = "font-size:12px;text-align:center;margin-top:4px;";
      svg.appendChild(cap);
    }
  }

  return svg;
}

// --- Compare chart ---

export type CompareMetric = "output" | "cadence" | "resistance" | "heartRate" | "speed";

export const COMPARE_METRICS: { key: CompareMetric; label: string }[] = [
  { key: "output", label: "Output (watts)" },
  { key: "cadence", label: "Cadence (rpm)" },
  { key: "resistance", label: "Resistance (%)" },
  { key: "heartRate", label: "Heart Rate (bpm)" },
  { key: "speed", label: "Speed (mph)" },
];

interface CompareRide {
  label: string;
  timeSeries: PerformanceTimeSeries;
}

/**
 * Render an overlay chart comparing multiple rides on a single metric.
 * Each ride gets its own colored line keyed by label.
 */
export function renderCompareChart(
  rides: CompareRide[],
  metric: CompareMetric,
  width = 800,
  height = 300,
  durationSeconds?: number,
): SVGElement | HTMLElement {
  // Long (tidy) data for the line marks
  const data: { second: number; value: number; label: string }[] = [];
  for (const ride of rides) {
    const values = ride.timeSeries[metric];
    for (let i = 0; i < values.length; i++) {
      data.push({ second: i, value: values[i], label: ride.label });
    }
  }

  if (data.length === 0) {
    return Plot.plot({ width, height, marks: [] });
  }

  const maxSecond = Math.max(...data.map((d) => d.second));
  const xMax = durationSeconds ?? maxSecond;
  const tickInterval = xMax <= 600 ? 60 : xMax <= 1800 ? 300 : 600;
  const compareTicks = Array.from(
    { length: Math.floor(xMax / tickInterval) + 1 },
    (_, i) => i * tickInterval,
  );
  if (xMax % tickInterval !== 0) compareTicks.push(xMax);

  const metricLabel = COMPARE_METRICS.find((m) => m.key === metric)?.label ?? metric;

  // Build wide dataset: one row per second with a column per ride label.
  // This lets a single Plot.tip show all rides' values at the hovered second.
  const rideLabels = rides.map((r) => r.label);
  const maxLen = Math.max(...rides.map((r) => r.timeSeries[metric].length));
  const wideData: Record<string, unknown>[] = [];
  for (let s = 0; s < maxLen; s++) {
    const row: Record<string, unknown> = { second: s };
    for (const ride of rides) {
      const vals = ride.timeSeries[metric];
      if (s < vals.length) row[ride.label] = vals[s];
    }
    wideData.push(row);
  }

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const marks: Plot.Markish[] = [
    // Ride lines
    Plot.lineY(data, {
      x: "second",
      y: "value",
      stroke: "label",
      strokeWidth: 1.5,
    }),
    // Vertical crosshair rule
    Plot.ruleX(wideData, Plot.pointerX({ x: "second", stroke: "#888", strokeDasharray: "4 3", strokeWidth: 1 })),
    // Highlight dots on each line at the hovered second
    ...rideLabels.map((label) =>
      Plot.dot(
        data.filter((d) => d.label === label),
        Plot.pointerX({ x: "second", y: "value", stroke: "label", fill: "white", r: 4, strokeWidth: 2 }),
      ),
    ),
  ];

  const plot = Plot.plot({
    width,
    height,
    x: {
      label: null,
      domain: [0, xMax],
      ticks: compareTicks,
      tickFormat: (d: number) => `${Math.floor(d / 60)}m`,
    },
    y: {
      label: metricLabel,
      grid: true,
    },
    color: { legend: true, domain: rideLabels },
    marks,
  });

  // Resolve line colors from the plot's color scale
  const colorInfo = plot.scale("color");
  const colorMap = new Map<string, string>();
  if (colorInfo?.domain && colorInfo?.range) {
    const domain = Array.from(colorInfo.domain);
    const range = Array.from(colorInfo.range);
    for (let i = 0; i < domain.length; i++) {
      colorMap.set(String(domain[i]), String(range[i % range.length]));
    }
  }

  // Build forward x scale: second → SVG pixel x
  const xInfo = plot.scale("x");
  const xRange = xInfo?.range ? Array.from(xInfo.range) as number[] : [0, width];
  const xDomain = xInfo?.domain ? Array.from(xInfo.domain) as number[] : [0, maxSecond];
  const secondToPixel = scaleLinear()
    .domain(xDomain as [number, number])
    .range(xRange as [number, number]);

  // Container with relative positioning so tooltip can float
  const container = document.createElement("div");
  container.style.position = "relative";
  container.appendChild(plot);

  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "position:absolute;display:none;pointer-events:none;" +
    "background:white;border:1px solid #ddd;border-radius:6px;" +
    "padding:8px 12px;font-size:13px;font-family:system-ui,sans-serif;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap;z-index:10;" +
    "transform:translateX(-50%);";
  container.appendChild(tooltip);

  // Listen for Plot's "input" event fired by pointerX marks
  plot.addEventListener("input", () => {
    const datum = (plot as unknown as { value: Record<string, unknown> | null }).value;
    if (!datum || datum.second == null) {
      tooltip.style.display = "none";
      return;
    }

    const second = Number(datum.second);
    const row = second >= 0 && second < maxLen ? wideData[second] : null;
    if (!row) {
      tooltip.style.display = "none";
      return;
    }

    let html = `<div style="font-weight:600;margin-bottom:4px">${fmtTime(second)}</div>`;
    for (const label of rideLabels) {
      const val = row[label];
      if (val == null) continue;
      const color = colorMap.get(label) ?? "#999";
      html +=
        `<div style="display:flex;align-items:center;gap:5px">` +
        `<span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;flex-shrink:0"></span>` +
        `<span>${label}: <b>${val}</b></span></div>`;
    }
    tooltip.innerHTML = html;
    tooltip.style.display = "block";

    // Position: horizontally at the crosshair x, vertically at chart bottom
    const pixelX = secondToPixel(second);

    // Find the SVG to compute its offset within the container
    const svgEl = plot.tagName.toLowerCase() === "svg"
      ? plot
      : plot.querySelector("svg");
    const svgOffsetLeft = svgEl ? (svgEl as HTMLElement).offsetLeft ?? 0 : 0;
    const svgBottom = svgEl
      ? ((svgEl as HTMLElement).offsetTop ?? 0) + ((svgEl as HTMLElement).offsetHeight ?? height)
      : height;

    tooltip.style.left = `${svgOffsetLeft + pixelX}px`;
    tooltip.style.top = `${svgBottom + 4}px`;
  });

  return container;
}

/**
 * Render a single-ride, single-metric time-series chart with crosshair + floating tooltip.
 */
export function renderMetricChart(
  timeSeries: PerformanceTimeSeries,
  metric: CompareMetric,
  width = 800,
  height = 200,
  durationSeconds?: number,
): HTMLElement {
  const values = timeSeries[metric];
  if (values.length === 0) {
    return Plot.plot({ width, height, marks: [] }) as unknown as HTMLElement;
  }

  const data = values.map((v, i) => ({ second: i, value: v }));
  const maxSecond = values.length - 1;
  const xMax = durationSeconds ?? maxSecond;
  const tickInterval = xMax <= 600 ? 60 : xMax <= 1800 ? 300 : 600;
  const metricTicks = Array.from({ length: Math.floor(xMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
  if (xMax % tickInterval !== 0) metricTicks.push(xMax);
  const metricInfo = COMPARE_METRICS.find((m) => m.key === metric);
  const metricLabel = metricInfo?.label ?? metric;
  const metricUnit = metricInfo?.label.match(/\(([^)]+)\)/)?.[1] ?? "";

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const marks: Plot.Markish[] = [
    Plot.lineY(data, { x: "second", y: "value", stroke: "#2563eb", strokeWidth: 1.5 }),
    Plot.ruleX(data, Plot.pointerX({ x: "second", stroke: "#888", strokeDasharray: "4 3", strokeWidth: 1 })),
    Plot.dot(data, Plot.pointerX({ x: "second", y: "value", stroke: "#2563eb", fill: "white", r: 4, strokeWidth: 2 })),
  ];

  const plot = Plot.plot({
    width,
    height,
    x: {
      label: null,
      domain: [0, xMax],
      ticks: metricTicks,
      tickFormat: (d: number) => `${Math.floor(d / 60)}m`,
    },
    y: { label: metricLabel, grid: true },
    marks,
  });

  // Build forward x scale: second -> SVG pixel x
  const xInfo = plot.scale("x");
  const xRange = xInfo?.range ? Array.from(xInfo.range) as number[] : [0, width];
  const xDomain = xInfo?.domain ? Array.from(xInfo.domain) as number[] : [0, maxSecond];
  const secondToPixel = scaleLinear()
    .domain(xDomain as [number, number])
    .range(xRange as [number, number]);

  const container = document.createElement("div");
  container.style.position = "relative";
  container.appendChild(plot);

  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "position:absolute;display:none;pointer-events:none;" +
    "background:white;border:1px solid #ddd;border-radius:6px;" +
    "padding:6px 10px;font-size:13px;font-family:system-ui,sans-serif;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.15);white-space:nowrap;z-index:10;" +
    "transform:translateX(-50%);";
  container.appendChild(tooltip);

  // The y-axis range gives us the pixel bounds of the plot area within the SVG.
  // range[0] is the bottom of the plot area (Plot uses screen coords: top < bottom).
  const yInfo = plot.scale("y");
  const plotAreaBottom = yInfo?.range ? (Array.from(yInfo.range) as number[])[0] : height;

  plot.addEventListener("input", () => {
    const datum = (plot as unknown as { value: Record<string, unknown> | null }).value;
    if (!datum || datum.second == null) {
      tooltip.style.display = "none";
      return;
    }

    const second = Number(datum.second);
    const val = second >= 0 && second < values.length ? values[second] : null;
    if (val == null) {
      tooltip.style.display = "none";
      return;
    }

    tooltip.innerHTML = `<span style="font-weight:600">${fmtTime(second)}</span> &mdash; <b>${val}</b>${metricUnit ? ` ${metricUnit}` : ""}`;
    tooltip.style.display = "block";

    const pixelX = secondToPixel(second);
    const svgEl = plot.tagName.toLowerCase() === "svg" ? plot : plot.querySelector("svg");
    const svgOffsetLeft = svgEl ? (svgEl as HTMLElement).offsetLeft ?? 0 : 0;
    const svgOffsetTop = svgEl ? (svgEl as HTMLElement).offsetTop ?? 0 : 0;

    tooltip.style.left = `${svgOffsetLeft + pixelX}px`;
    tooltip.style.top = `${svgOffsetTop + plotAreaBottom - 4}px`;
  });

  return container;
}

// --- Insights charts ---

import type { DailyWorkoutCount } from "./database";

/**
 * Render a generic GitHub-style activity grid from daily values.
 */
/** Cell size and margins used by the activity grid — exported for label alignment. */
export const ACTIVITY_GRID_LAYOUT = { cellSize: 18, marginTop: 6, marginBottom: 20 } as const;

export function renderActivityGrid(
  dailyValues: { workout_date: string; value: number }[],
  tooltipLabel = "workouts",
  color = "#216e39",
  onDayClick?: (date: string) => void,
  hideDayLabels = false,
): SVGElement | HTMLElement {
  const valueMap = new Map(dailyValues.map((d) => [d.workout_date, d.value]));

  // Generate all days from earliest data point to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const earliest = dailyValues.length > 0
    ? new Date(dailyValues.reduce((min, d) => d.workout_date < min ? d.workout_date : min, dailyValues[0].workout_date) + "T00:00:00")
    : new Date(today.getTime() - 52 * 7 * 86400000);
  earliest.setHours(0, 0, 0, 0);

  const startDate = new Date(earliest);
  // Align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const data: { week: number; day: number; value: number; date: string }[] = [];
  const current = new Date(startDate);
  let weekNum = 0;
  const weekStartMonth: { week: number; month: string; key: string }[] = [];

  while (current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    const day = current.getDay();
    if (day === 0 && (weekStartMonth.length === 0 || weekStartMonth[weekStartMonth.length - 1].week !== weekNum)) {
      const monthLabel = current.toLocaleString("en-US", { month: "short" });
      const monthKey = `${current.getFullYear()}-${current.getMonth()}`;
      weekStartMonth.push({ week: weekNum, month: monthLabel, key: monthKey });
    }
    data.push({
      week: weekNum,
      day,
      value: valueMap.get(dateStr) ?? 0,
      date: dateStr,
    });
    current.setDate(current.getDate() + 1);
    if (current.getDay() === 0) weekNum++;
  }

  // Deduplicate month labels: only keep the first occurrence of each year-month
  const seenMonths = new Set<string>();
  const monthTicks: { week: number; month: string }[] = [];
  for (const entry of weekStartMonth) {
    if (!seenMonths.has(entry.key)) {
      seenMonths.add(entry.key);
      monthTicks.push({ week: entry.week, month: entry.month });
    }
  }

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Fixed cell size for consistent squares regardless of container size
  const { cellSize, marginTop, marginBottom } = ACTIVITY_GRID_LAYOUT;
  const marginLeft = hideDayLabels ? 2 : 30;
  const marginRight = 20;
  const numWeeks = weekNum + 1;
  const plotWidth = cellSize * numWeeks + marginLeft + marginRight;
  const plotHeight = cellSize * 7 + marginTop + marginBottom;

  const svg = Plot.plot({
    width: plotWidth,
    height: plotHeight,
    marginTop,
    marginLeft,
    marginBottom,
    x: {
      label: null,
      ticks: monthTicks.map((t) => t.week),
      tickFormat: (d: number) => monthTicks.find((t) => t.week === d)?.month ?? "",
    },
    y: {
      label: null,
      domain: [0, 1, 2, 3, 4, 5, 6],
      ticks: hideDayLabels ? [] : [1, 3, 5],
      tickFormat: (d: number) => dayLabels[d] ?? "",
    },
    color: {
      type: "linear",
      domain: [0, Math.max(1, ...data.map((d) => d.value))],
      range: ["#ebedf0", color],
    },
    marks: [
      Plot.cell(data, {
        x: "week",
        y: "day",
        fill: "value",
        inset: 1,
        rx: 2,
      }),
      // Top rows: tooltip below; bottom rows: tooltip above.
      // maxRadius prevents each tip from matching cells in the other half.
      Plot.tip(data.filter((d) => d.day <= 2), Plot.pointer({
        x: "week",
        y: "day",
        maxRadius: cellSize * 0.49,
        title: (d: { date: string; value: number }) => {
          const formatted = Number.isInteger(d.value) ? String(d.value) : d.value.toFixed(1);
          return `${d.date}: ${formatted} ${tooltipLabel}`;
        },
        anchor: "top",
        dy: cellSize / 2,
      })),
      Plot.tip(data.filter((d) => d.day > 2), Plot.pointer({
        x: "week",
        y: "day",
        maxRadius: cellSize * 0.49,
        title: (d: { date: string; value: number }) => {
          const formatted = Number.isInteger(d.value) ? String(d.value) : d.value.toFixed(1);
          return `${d.date}: ${formatted} ${tooltipLabel}`;
        },
        anchor: "bottom",
        dy: -cellSize / 2,
      })),
    ],
  });

  if (onDayClick) {
    const rects = svg.querySelectorAll('[aria-label="cell"] rect');
    rects.forEach((rect, i) => {
      const d = data[i];
      if (d && d.value > 0) {
        (rect as SVGRectElement).style.cursor = "pointer";
        rect.addEventListener("click", () => onDayClick(d.date));
      } else {
        rect.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
    });
  }

  return svg;
}

/**
 * Render a GitHub-style heatmap of daily workout counts for the last 52 weeks.
 */
export function renderWorkoutHeatmap(
  dailyCounts: DailyWorkoutCount[],
  onDayClick?: (date: string) => void,
): SVGElement | HTMLElement {
  const dailyValues = dailyCounts.map((d) => ({ workout_date: d.workout_date, value: d.count }));
  return renderActivityGrid(dailyValues, "workouts", "#216e39", onDayClick);
}

/**
 * Render a scatter plot of Efficiency Factor over time with a rolling average trend line.
 */
export function renderEFTrendChart(
  data: { date: Date; ef: number }[],
  width = 800,
  height = 300,
): SVGElement | HTMLElement {
  if (data.length === 0) {
    return Plot.plot({ width, height, marks: [] });
  }

  // Compute rolling average (window of 10)
  const window = 10;
  const rollingData: { date: Date; ef: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((sum, d) => sum + d.ef, 0) / slice.length;
    rollingData.push({ date: data[i].date, ef: avg });
  }

  return Plot.plot({
    width,
    height,
    x: { label: null, type: "utc" },
    y: { label: "EF (watts/bpm)", grid: true },
    marks: [
      Plot.dot(data, {
        x: "date",
        y: "ef",
        fill: "#93c5fd",
        r: 3,
        tip: true,
        title: (d: { date: Date; ef: number }) =>
          `${d.date.toLocaleDateString()} — EF: ${d.ef.toFixed(2)}`,
      }),
      Plot.lineY(rollingData, {
        x: "date",
        y: "ef",
        stroke: "#2563eb",
        strokeWidth: 2,
      }),
    ],
  });
}

/** Render a custom chart, choosing single or dual axis. */
export function renderCustomChart(
  workouts: Workout[],
  chart: ChartDefinition,
  width = 800,
  height = 400,
  onCategoryClick?: (label: string) => void,
  onWorkoutClick?: (workoutId: string) => void,
): SVGElement | HTMLElement {
  const svg = renderChart(workouts, chart, width, height);

  if (onCategoryClick && chart.x_axis_mode === "category" && chart.mark_type === "bar") {
    const data = prepareChartData(workouts, chart);
    const rects = svg.querySelectorAll('[aria-label="bar"] rect');
    rects.forEach((rect, i) => {
      const d = data[i];
      if (d && d.label) {
        (rect as SVGRectElement).style.cursor = "pointer";
        rect.addEventListener("click", () => onCategoryClick(d.label!));
      }
    });
  }

  // For non-aggregated charts, attach click handlers and visual data-point circles
  if (!isAggregatedMode(chart.x_axis_mode)) {
    const data = prepareChartData(workouts, chart);
    if (chart.mark_type === "dot" && onWorkoutClick) {
      const circles = svg.querySelectorAll('[aria-label="dot"] circle');
      circles.forEach((circle, i) => {
        const d = data[i];
        if (d?._workout) {
          (circle as SVGCircleElement).style.cursor = "pointer";
          circle.addEventListener("click", () => onWorkoutClick(d._workout!.id));
        }
      });
    } else if (chart.mark_type === "bar" && onWorkoutClick) {
      // Non-aggregated bars (rectY with x1/x2)
      const rects = svg.querySelectorAll('[aria-label="rect"] rect');
      rects.forEach((rect, i) => {
        const d = data[i];
        if (d?._workout) {
          (rect as SVGRectElement).style.cursor = "pointer";
          rect.addEventListener("click", () => onWorkoutClick(d._workout!.id));
        }
      });
    } else if (chart.mark_type === "line") {
      // Line chart — always show data-point circles; optionally clickable
      const categorical = chart.x_axis_mode === "category" || chart.x_axis_sequential;
      attachLineClickTargets(svg, data, onWorkoutClick, categorical);
    }
  }

  return svg;
}

/** Add circles over each data point on a line chart; optionally clickable. */
function attachLineClickTargets(
  svg: SVGElement | HTMLElement,
  data: WorkoutPoint[],
  onClick: ((workoutId: string) => void) | undefined,
  categorical: boolean,
) {
  // Observable Plot exposes computed scales via .scale() on the returned element
  const plotEl = svg as SVGElement & { scale?: (name: string) => { apply?: (v: unknown) => number } };
  if (!plotEl.scale) return;

  const xScale = plotEl.scale("x");
  const yScale = plotEl.scale("y");
  if (!xScale?.apply || !yScale?.apply) return;

  // Find the plot area <g> to append circles into
  const plotArea = svg.querySelector('[aria-label="line"]') ?? svg.querySelector("g");
  if (!plotArea) return;

  for (const d of data) {
    const xVal = categorical ? d.label : d.date;
    const cx = xScale.apply(xVal);
    const cy = yScale.apply(d.ys[0]);
    if (cx == null || cy == null || isNaN(cx) || isNaN(cy)) continue;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", "currentColor");
    if (onClick && d._workout) {
      circle.style.cursor = "pointer";
      circle.addEventListener("click", () => onClick(d._workout!.id));
    }
    plotArea.appendChild(circle);
  }
}
