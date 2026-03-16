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
      point.group = ((w as unknown as Record<string, unknown>)[chart.group_by] as string) ?? "Unknown";
    }
    points.push(point);
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

  let mark: Plot.Markish;
  if (chart.mark_type === "bar") {
    mark = Plot.rectY(toBarData(data), {
      x1: "x1",
      x2: "x2",
      y: "y",
      fill: color,
      ...(chart.group_by ? {} : { fillOpacity: 0.8 }),
    });
  } else if (chart.mark_type === "dot") {
    mark = Plot.dot(data, { x: "date", y: "y", stroke: color, fill: color, r: 3 });
  } else {
    mark = Plot.lineY(data, {
      x: "date", y: "y", stroke: color, strokeWidth: 1.5,
      ...(chart.group_by ? { sort: "date" } : {}),
    });
  }

  return Plot.plot({
    width,
    height,
    marginRight: 40,
    x: { label: null, type: "utc" },
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
      y: rightToLeft(d.y2!),
      group: d.group,
    }));

  const marks: Plot.Markish[] = [];
  const leftColor = "#2563eb";
  const rightColor = "#dc2626";

  // Left Y marks
  if (chart.mark_type === "bar") {
    marks.push(Plot.rectY(toBarData(data), { x1: "x1", x2: "x2", y: "y", fill: leftColor, fillOpacity: 0.8 }));
  } else if (chart.mark_type === "dot") {
    marks.push(Plot.dot(data, { x: "date", y: "y", stroke: leftColor, fill: leftColor, r: 3 }));
  } else {
    marks.push(Plot.lineY(data, { x: "date", y: "y", stroke: leftColor, strokeWidth: 1.5 }));
  }

  // Right Y marks (mapped into left range)
  if (chart.mark_type === "bar") {
    marks.push(Plot.rectY(toBarData(mappedData), { x1: "x1", x2: "x2", y: "y", fill: rightColor, fillOpacity: 0.5 }));
  } else if (chart.mark_type === "dot") {
    marks.push(Plot.dot(mappedData, { x: "date", y: "y", stroke: rightColor, fill: rightColor, r: 3 }));
  } else {
    marks.push(Plot.lineY(mappedData, { x: "date", y: "y", stroke: rightColor, strokeWidth: 1.5, strokeDasharray: "4 2" }));
  }

  // Right-side axis ticks
  const leftToRight = scaleLinear().domain(leftExtent).range(rightExtent);
  const leftDomain = [leftExtent[0], leftExtent[1]];
  const tickCount = 6;
  const leftStep = (leftDomain[1] - leftDomain[0]) / (tickCount - 1);
  const rightTicks = Array.from({ length: tickCount }, (_, i) => {
    const leftVal = leftDomain[0] + i * leftStep;
    return { y: leftVal, label: Math.round(leftToRight(leftVal)).toString() };
  });

  marks.push(
    Plot.text(rightTicks, {
      x: () => null,
      y: "y",
      text: "label",
      textAnchor: "start",
      dx: width - 65,
      fontSize: 10,
      fill: rightColor,
    }),
  );

  return Plot.plot({
    width,
    height,
    marginRight: 70,
    x: { label: null, type: "utc" },
    y: {
      label: fieldLabel(leftField.field),
      grid: true,
      domain: leftExtent,
    },
    marks,
    caption: `Blue: ${fieldLabel(leftField.field)} · Red: ${fieldLabel(rightField.field)}`,
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
