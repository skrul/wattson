import { renderRideDetailChart, type InstructorCue } from "./charts";
import type { Workout, PerformanceTimeSeries, ShareChartSettings } from "../types";

/** Render an SVG element to a canvas-drawable image. */
export function svgToImage(el: SVGElement | HTMLElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // Observable Plot wraps SVG in <figure> and may include small legend swatch
    // SVGs before the main chart SVG. The chart SVG is the one with a viewBox.
    let svgEl: SVGElement | null;
    if (el.tagName.toLowerCase() === "svg" && el.hasAttribute("viewBox")) {
      svgEl = el as SVGElement;
    } else {
      svgEl = el.querySelector("svg[viewBox]") as SVGElement | null;
    }
    if (!svgEl) {
      reject(new Error("No chart SVG element found"));
      return;
    }

    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG as image"));
    };
    img.src = url;
  });
}

export const EXPORT_WIDTH = 1200;
export const SCALE = 2;
export const PADDING = 32;
export const CHART_WIDTH = EXPORT_WIDTH - PADDING * 2;
export const CHART_HEIGHT = 400;

export function formatExportDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatExportDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Build the full export PNG as a blob using canvas. */
export async function renderExportPng(
  workout: Workout,
  ftp: number | null,
  timeSeries: PerformanceTimeSeries,
  cues?: InstructorCue[] | null,
  settings?: ShareChartSettings,
  displayName?: string | null,
): Promise<Blob> {
  // Render chart SVG at export width
  const isPZ = workout.class_type === "Power Zone";
  const chartEl = renderRideDetailChart(timeSeries, ftp || null, {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    durationSeconds: workout.duration_seconds ?? undefined,
    overlays: settings?.overlays,
    overlayColors: settings?.overlayColors,
    cueColor: settings?.cueColor,
    showZoneBands: (settings?.zoneBands ?? "pz-only") === "always" || ((settings?.zoneBands ?? "pz-only") === "pz-only" && isPZ),
    showInstructorCues: settings?.showInstructorCues,
    showYAxis: settings?.showYAxis,
  }, cues);
  const chartImg = await svgToImage(chartEl);

  // Build stats list, filtered by settings
  const stats: [string, string][] = [];
  const s = settings?.stats;
  if ((s?.avgPower ?? true) && workout.avg_output != null) stats.push(["Avg Power", `${workout.avg_output} w`]);
  if ((s?.totalOutput ?? true) && workout.total_work != null) stats.push(["Total Output", `${Math.round(workout.total_work / 1000)} kj`]);
  if ((s?.calories ?? true) && workout.calories != null) stats.push(["Calories", `${workout.calories} kcal`]);
  if ((s?.distance ?? true) && workout.distance != null) stats.push(["Distance", `${workout.distance.toFixed(2)} mi`]);
  if ((s?.avgCadence ?? true) && workout.avg_cadence != null) stats.push(["Avg Cadence", `${workout.avg_cadence} rpm`]);
  if ((s?.avgResistance ?? true) && workout.avg_resistance != null) stats.push(["Avg Resistance", `${workout.avg_resistance}%`]);
  if ((s?.avgSpeed ?? true) && workout.avg_speed != null) stats.push(["Avg Speed", `${workout.avg_speed.toFixed(1)} mph`]);
  if ((s?.avgHR ?? true) && workout.avg_heart_rate != null) stats.push(["Avg HR", `${workout.avg_heart_rate} bpm`]);
  if ((s?.striveScore ?? true) && workout.strive_score != null) stats.push(["Strive Score", workout.strive_score.toFixed(1)]);
  if ((s?.ftp ?? true) && ftp) stats.push(["FTP", `${ftp} w`]);

  const showHeader = settings?.showHeader !== false;

  // Layout measurements
  const headerHeight = showHeader ? 60 : 0;
  const footerHeight = stats.length > 0 ? 60 : 0;
  const totalHeight = PADDING + headerHeight + CHART_HEIGHT + footerHeight + PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, EXPORT_WIDTH, totalHeight);

  let y = PADDING;

  // Header — title + subtitle
  if (showHeader) {
    ctx.fillStyle = "#111827";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(workout.title, PADDING, y + 18);

    // Right side: display name + date/time
    ctx.textAlign = "right";
    if (displayName) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "600 14px system-ui, -apple-system, sans-serif";
      ctx.fillText(displayName, EXPORT_WIDTH - PADDING, y + 18);
    }
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px system-ui, -apple-system, sans-serif";
    ctx.fillText(formatExportDateTime(workout.date), EXPORT_WIDTH - PADDING, y + 40);
    ctx.textAlign = "start";

    // Subtitle: instructor + date
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px system-ui, -apple-system, sans-serif";
    const subtitle = [
      workout.instructor,
      formatExportDate(workout.date),
    ].filter(Boolean).join(" \u00B7 ");
    ctx.fillText(subtitle, PADDING, y + 40);

    y += headerHeight;
  }

  // Chart SVG image
  ctx.drawImage(chartImg, PADDING, y, CHART_WIDTH, CHART_HEIGHT);

  y += CHART_HEIGHT;

  // Footer stats
  if (stats.length > 0) {
    // Divider line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y + 12);
    ctx.lineTo(EXPORT_WIDTH - PADDING, y + 12);
    ctx.stroke();

    const statWidth = CHART_WIDTH / stats.length;
    for (let i = 0; i < stats.length; i++) {
      const [label, value] = stats[i];
      const cx = PADDING + statWidth * i + statWidth / 2;

      // Value
      ctx.fillStyle = "#111827";
      ctx.font = "600 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(value, cx, y + 32);

      // Label
      ctx.fillStyle = "#6b7280";
      ctx.font = "10px system-ui, -apple-system, sans-serif";
      ctx.fillText(label, cx, y + 46);
    }
    ctx.textAlign = "start";
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
