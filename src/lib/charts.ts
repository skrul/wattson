import * as Plot from "@observablehq/plot";
import type { PerformanceTimeSeries } from "../types";

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
