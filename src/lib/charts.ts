import * as Plot from "@observablehq/plot";
import { scaleLinear } from "d3-scale";
import { extent } from "d3-array";
import type { PerformanceTimeSeries, Workout, ChartDefinition } from "../types";
import { FIELD_MAP } from "./fields";

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
 * Parse instructor_cues from raw ride details JSON.
 * Returns cue intervals for power zone segments, or null if none found.
 */
export function parseInstructorCues(rawRideDetailsJson: string): InstructorCue[] | null {
  try {
    const data = JSON.parse(rawRideDetailsJson);
    const cues = data.instructor_cues;
    if (!Array.isArray(cues)) return null;

    // Cue offsets are relative to the ride video start, but performance data
    // starts at the pedaling offset. Subtract it so cues align with the chart.
    const pedalingOffset: number = data.ride?.pedaling_start_offset ?? 0;

    const parsed: InstructorCue[] = [];
    for (const cue of cues) {
      if (cue.segment_type !== "power_zone") continue;
      const zone = cue.metrics?.[0]?.upper;
      if (zone == null || !cue.offsets) continue;
      parsed.push({
        startSecond: cue.offsets.start - pedalingOffset,
        endSecond: cue.offsets.end - pedalingOffset,
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
  }));

  const marks: Plot.Markish[] = [];

  // Zone bands (only if FTP is available)
  if (ftp != null) {
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

    // Zone labels on the right
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
        fill: "#666",
      }),
    );
  }

  // Class plan overlay (instructor cues)
  if (ftp != null && cues && cues.length > 0) {
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
        stroke: "#333",
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
          stroke: "#333",
          strokeOpacity: 0.5,
          strokeWidth: 2,
        }),
      );
    }
  }

  // Output line
  marks.push(
    Plot.lineY(data, {
      x: "second",
      y: "output",
      stroke: "#e44",
      strokeWidth: 1.5,
    }),
  );

  const totalSeconds = timeSeries.seconds.length;
  const tickInterval = totalSeconds <= 600 ? 60 : totalSeconds <= 1800 ? 300 : 600;

  return Plot.plot({
    width,
    height,
    marginRight: 36,
    x: {
      label: null,
      ticks: Array.from({ length: Math.floor(totalSeconds / tickInterval) + 1 }, (_, i) => i * tickInterval),
      tickFormat: (d: number) => {
        const m = Math.floor(d / 60);
        return `${m}m`;
      },
    },
    y: {
      domain: [0, yMax],
      label: "Watts",
      grid: true,
    },
    marks,
  });
}

// --- Custom chart rendering ---

interface WorkoutPoint {
  date: Date;
  label?: string;
  y: number;
  y2?: number;
  group?: string;
}

/** Fields whose raw DB values need scaling for display. */
const FIELD_DISPLAY_SCALE: Record<string, number> = {
  total_work: 1 / 1000, // joules → kj
};

function scaleValue(field: string, value: number): number {
  const scale = FIELD_DISPLAY_SCALE[field];
  return scale ? Math.round(value * scale) : value;
}

function prepareChartData(
  workouts: Workout[],
  chart: ChartDefinition,
): WorkoutPoint[] {
  const yField = chart.y_fields[0]?.field;
  const y2Field = chart.y_fields[1]?.field;
  if (!yField) return [];

  const points: WorkoutPoint[] = [];
  for (const w of workouts) {
    const yVal = (w as unknown as Record<string, unknown>)[yField];
    if (yVal == null) continue;
    const point: WorkoutPoint = {
      date: new Date(w.date * 1000),
      y: scaleValue(yField, yVal as number),
    };
    if (y2Field) {
      const y2Val = (w as unknown as Record<string, unknown>)[y2Field];
      if (y2Val != null) point.y2 = scaleValue(y2Field, y2Val as number);
    }
    if (chart.group_by) {
      const raw = String((w as unknown as Record<string, unknown>)[chart.group_by] ?? "Unknown");
      const displayFn = FIELD_MAP[chart.group_by]?.displayValue;
      point.group = displayFn ? displayFn(raw) : raw;
    }
    points.push(point);
  }

  if (chart.x_axis_mode === "workout") {
    const seen = new Map<string, number>();
    for (const p of points) {
      const base = p.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      p.label = n > 1 ? `${base} #${n}` : base;
    }
  }

  return points;
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function toBarData(data: WorkoutPoint[]) {
  return data.map((d) => ({
    ...d,
    x1: new Date(d.date.getTime() - HALF_DAY_MS),
    x2: new Date(d.date.getTime() + HALF_DAY_MS),
  }));
}

function fieldLabel(fieldKey: string): string {
  return FIELD_MAP[fieldKey]?.label ?? fieldKey;
}

const MAX_X_TICKS = 20;

function workoutXConfig(data: WorkoutPoint[]): Record<string, unknown> {
  const domain = data.map((d) => d.label);
  const n = domain.length;
  const cfg: Record<string, unknown> = {
    label: null,
    domain,
    tickFormat: (d: string) => d.replace(/ #\d+$/, ""),
  };
  if (n > MAX_X_TICKS) {
    const step = Math.ceil(n / MAX_X_TICKS);
    cfg.ticks = domain.filter((_, i) => i % step === 0);
    cfg.tickRotate = -45;
  }
  return cfg;
}

/** Render a chart with a single Y axis. */
export function renderSingleAxisChart(
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

  const color = chart.group_by ? "group" : "#2563eb";
  const workout = chart.x_axis_mode === "workout";
  const xKey = workout ? "label" : "date";

  let mark: Plot.Markish;
  if (chart.mark_type === "bar") {
    if (workout) {
      mark = Plot.barY(data, {
        x: "label",
        y: "y",
        fill: color,
        ...(chart.group_by ? {} : { fillOpacity: 0.8 }),
      });
    } else {
      mark = Plot.rectY(toBarData(data), {
        x1: "x1",
        x2: "x2",
        y: "y",
        fill: color,
        ...(chart.group_by ? {} : { fillOpacity: 0.8 }),
      });
    }
  } else if (chart.mark_type === "dot") {
    mark = Plot.dot(data, { x: xKey, y: "y", stroke: color, fill: color, r: 3 });
  } else {
    mark = Plot.lineY(data, {
      x: xKey, y: "y", stroke: color, strokeWidth: 1.5,
      ...(chart.group_by ? { sort: xKey } : {}),
    });
  }

  const xConfig: Record<string, unknown> = workout
    ? workoutXConfig(data)
    : { label: null, type: "utc" };

  return Plot.plot({
    width,
    height,
    marginRight: 40,
    marginBottom: workout && data.length > MAX_X_TICKS ? 60 : undefined,
    x: xConfig,
    y: { label: fieldLabel(yField.field), grid: true },
    color: chart.group_by ? { legend: true } : undefined,
    marks: [mark],
  });
}

/** Render a chart with two Y axes (left + right). */
export function renderDualAxisChart(
  workouts: Workout[],
  chart: ChartDefinition,
  width = 800,
  height = 400,
): SVGElement | HTMLElement {
  const data = prepareChartData(workouts, chart);
  if (chart.y_fields.length < 2 || data.length === 0) {
    return renderSingleAxisChart(workouts, chart, width, height);
  }

  const leftField = chart.y_fields.find((f) => f.side === "left") ?? chart.y_fields[0];
  const rightField = chart.y_fields.find((f) => f.side === "right") ?? chart.y_fields[1];

  // Compute extent of both Y fields
  const leftExtent = extent(data, (d) => d.y) as [number, number];
  const rightValues = data.map((d) => d.y2).filter((v): v is number => v != null);
  const rightExtent = extent(rightValues) as [number, number];

  if (leftExtent[0] == null || rightExtent[0] == null) {
    return renderSingleAxisChart(workouts, chart, width, height);
  }

  // Map right-axis values into left-axis range
  const rightToLeft = scaleLinear()
    .domain(rightExtent)
    .range(leftExtent);

  // Build mapped data for right axis
  const mappedData = data
    .filter((d) => d.y2 != null)
    .map((d) => ({
      date: d.date,
      label: d.label,
      y: rightToLeft(d.y2!),
      group: d.group,
    }));

  const marks: Plot.Markish[] = [];
  const leftColor = "#2563eb";
  const rightColor = "#dc2626";
  const workout = chart.x_axis_mode === "workout";
  const xKey = workout ? "label" : "date";

  // Left Y marks
  if (chart.mark_type === "bar") {
    if (workout) {
      marks.push(Plot.barY(data, { x: "label", y: "y", fill: leftColor, fillOpacity: 0.8 }));
    } else {
      marks.push(Plot.rectY(toBarData(data), { x1: "x1", x2: "x2", y: "y", fill: leftColor, fillOpacity: 0.8 }));
    }
  } else if (chart.mark_type === "dot") {
    marks.push(Plot.dot(data, { x: xKey, y: "y", stroke: leftColor, fill: leftColor, r: 3 }));
  } else {
    marks.push(Plot.lineY(data, { x: xKey, y: "y", stroke: leftColor, strokeWidth: 1.5 }));
  }

  // Right Y marks (mapped into left range)
  if (chart.mark_type === "bar") {
    if (workout) {
      marks.push(Plot.barY(mappedData, { x: "label", y: "y", fill: rightColor, fillOpacity: 0.5 }));
    } else {
      marks.push(Plot.rectY(toBarData(mappedData), { x1: "x1", x2: "x2", y: "y", fill: rightColor, fillOpacity: 0.5 }));
    }
  } else if (chart.mark_type === "dot") {
    marks.push(Plot.dot(mappedData, { x: xKey, y: "y", stroke: rightColor, fill: rightColor, r: 3 }));
  } else {
    marks.push(Plot.lineY(mappedData, { x: xKey, y: "y", stroke: rightColor, strokeWidth: 1.5, strokeDasharray: "4 2" }));
  }

  // Right-side axis ticks
  const leftToRight = scaleLinear().domain(leftExtent).range(rightExtent);
  const leftDomain = [leftExtent[0], leftExtent[1]];
  const tickCount = 6;
  const leftStep = (leftDomain[1] - leftDomain[0]) / (tickCount - 1);
  const maxXVal = workout
    ? data[data.length - 1]?.label
    : data.reduce((max, d) => (d.date > max ? d.date : max), data[0].date);
  const rightTicks = Array.from({ length: tickCount }, (_, i) => {
    const leftVal = leftDomain[0] + i * leftStep;
    return { x: maxXVal, y: leftVal, label: Math.round(leftToRight(leftVal)).toString() };
  });

  marks.push(
    Plot.text(rightTicks, {
      x: "x",
      y: "y",
      text: "label",
      textAnchor: "start",
      dx: 8,
      fontSize: 10,
      fill: rightColor,
    }),
  );

  const xConfig: Record<string, unknown> = workout
    ? workoutXConfig(data)
    : { label: null, type: "utc" };

  return Plot.plot({
    width,
    height,
    marginRight: 70,
    marginBottom: workout && data.length > MAX_X_TICKS ? 60 : undefined,
    x: xConfig,
    y: {
      label: fieldLabel(leftField.field),
      grid: true,
      domain: leftExtent,
    },
    marks,
    caption: `Blue: ${fieldLabel(leftField.field)} · Red: ${fieldLabel(rightField.field)}`,
  });
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
): SVGElement | HTMLElement {
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
  const tickInterval = maxSecond <= 600 ? 60 : maxSecond <= 1800 ? 300 : 600;

  const metricLabel = COMPARE_METRICS.find((m) => m.key === metric)?.label ?? metric;

  return Plot.plot({
    width,
    height,
    x: {
      label: null,
      ticks: Array.from(
        { length: Math.floor(maxSecond / tickInterval) + 1 },
        (_, i) => i * tickInterval,
      ),
      tickFormat: (d: number) => `${Math.floor(d / 60)}m`,
    },
    y: {
      label: metricLabel,
      grid: true,
    },
    color: { legend: true },
    marks: [
      Plot.lineY(data, {
        x: "second",
        y: "value",
        stroke: "label",
        strokeWidth: 1.5,
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
): SVGElement | HTMLElement {
  if (chart.y_fields.length >= 2) {
    return renderDualAxisChart(workouts, chart, width, height);
  }
  return renderSingleAxisChart(workouts, chart, width, height);
}
