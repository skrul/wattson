import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { renderRideDetailChart } from "../lib/charts";
import { svgToImage } from "../lib/exportUtils";
import type { Workout, PerformanceTimeSeries } from "../types";

interface ExportButtonProps {
  filename: string;
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
}

const EXPORT_WIDTH = 1200;
const SCALE = 2;
const PADDING = 32;
const CHART_WIDTH = EXPORT_WIDTH - PADDING * 2;
const CHART_HEIGHT = 400;

function formatExportDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Build the full export PNG as a blob using canvas. */
async function renderExportPng(
  workout: Workout,
  ftp: number | null,
  timeSeries: PerformanceTimeSeries,
): Promise<Blob> {
  // Render chart SVG at export width
  const chartEl = renderRideDetailChart(timeSeries, ftp, {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });
  const chartImg = await svgToImage(chartEl);

  // Build stats list
  const stats: [string, string][] = [];
  if (workout.avg_output != null) stats.push(["Avg Power", `${workout.avg_output} w`]);
  if (workout.total_work != null) stats.push(["Total Output", `${Math.round(workout.total_work / 1000)} kj`]);
  if (workout.calories != null) stats.push(["Calories", `${workout.calories} kcal`]);
  if (workout.distance != null) stats.push(["Distance", `${workout.distance.toFixed(2)} mi`]);
  if (workout.avg_cadence != null) stats.push(["Avg Cadence", `${workout.avg_cadence} rpm`]);
  if (workout.avg_resistance != null) stats.push(["Avg Resistance", `${workout.avg_resistance}%`]);
  if (workout.avg_heart_rate != null) stats.push(["Avg HR", `${workout.avg_heart_rate} bpm`]);
  if (ftp != null) stats.push(["FTP", `${ftp} w`]);

  // Layout measurements
  const headerHeight = 60;
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

  // Header — title
  ctx.fillStyle = "#111827";
  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(workout.title, PADDING, y + 18);

  // Header — subtitle
  ctx.fillStyle = "#6b7280";
  ctx.font = "13px system-ui, -apple-system, sans-serif";
  const subtitle = [
    workout.instructor,
    formatExportDate(workout.date),
    formatDuration(workout.duration_seconds),
  ].filter(Boolean).join(" \u00B7 ");
  ctx.fillText(subtitle, PADDING, y + 40);

  y += headerHeight;

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

export default function ExportButton({ filename, workout, ftp, timeSeries }: ExportButtonProps) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");

  async function handleCopy() {
    setStatus("copying");
    try {
      const blobPromise = renderExportPng(workout, ftp, timeSeries);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blobPromise }),
      ]);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function handleSave() {
    try {
      const filePath = await save({
        defaultPath: `${filename}.png`,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!filePath) return; // user cancelled
      const blob = await renderExportPng(workout, ftp, timeSeries);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Save failed:", err);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        disabled={status === "copying"}
        className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
      >
        {status === "copied" ? "Copied!" : status === "error" ? "Failed" : "Copy to Clipboard"}
      </button>
      <button
        onClick={handleSave}
        className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
      >
        Save as PNG
      </button>
    </div>
  );
}
