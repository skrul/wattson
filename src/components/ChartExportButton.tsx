import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { renderCustomChart } from "../lib/charts";
import { svgToImage } from "../lib/exportUtils";
import { FIELD_MAP } from "../lib/fields";
import type { ChartDefinition, Workout } from "../types";
import { isConditionActive, valueSummary } from "./FilterEditors";
import ShareMenu from "./ShareMenu";

const EXPORT_WIDTH = 1200;
const SCALE = 2;
const PADDING = 32;
const CHART_WIDTH = EXPORT_WIDTH - PADDING * 2;
const CHART_HEIGHT = 400;

async function renderChartExportPng(
  chart: ChartDefinition,
  workouts: Workout[],
): Promise<Blob> {
  const chartEl = renderCustomChart(workouts, chart, CHART_WIDTH, CHART_HEIGHT);
  const chartImg = await svgToImage(chartEl);

  // Build footer info
  const yLabels = chart.y_fields
    .map((f) => {
      const label = FIELD_MAP[f.field]?.label ?? f.field;
      return chart.y_fields.length > 1 ? `${label} (${f.side})` : label;
    })
    .join(" · ");

  const activeFilters = chart.filters.filter(isConditionActive);
  const filterSummary = activeFilters
    .map((c) => {
      const fieldLabel = FIELD_MAP[c.field]?.label ?? c.field;
      return `${fieldLabel} ${valueSummary(c)}`;
    })
    .join(", ");

  // Date range
  let dateRange = "";
  if (workouts.length > 0) {
    const first = new Date(workouts[0].date * 1000).toLocaleDateString();
    const last = new Date(workouts[workouts.length - 1].date * 1000).toLocaleDateString();
    dateRange = `${first} – ${last}`;
  }

  const footerLines = [yLabels, filterSummary, dateRange].filter(Boolean);

  const headerHeight = 50;
  const footerHeight = footerLines.length > 0 ? 20 + footerLines.length * 16 : 0;
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

  // Header — chart name
  ctx.fillStyle = "#111827";
  ctx.font = "600 18px system-ui, -apple-system, sans-serif";
  ctx.fillText(chart.name || "Chart", PADDING, y + 18);

  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${workouts.length} workouts · ${chart.mark_type}`, PADDING, y + 36);

  y += headerHeight;

  // Chart
  ctx.drawImage(chartImg, PADDING, y, CHART_WIDTH, CHART_HEIGHT);
  y += CHART_HEIGHT;

  // Footer
  if (footerLines.length > 0) {
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y + 10);
    ctx.lineTo(EXPORT_WIDTH - PADDING, y + 10);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "start";
    for (let i = 0; i < footerLines.length; i++) {
      ctx.fillText(footerLines[i], PADDING, y + 26 + i * 16);
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}

interface ChartExportButtonProps {
  chart: ChartDefinition;
  workouts: Workout[];
}

export default function ChartExportButton({ chart, workouts }: ChartExportButtonProps) {
  if (workouts.length === 0 || chart.y_fields.length === 0) return null;

  async function handleCopy() {
    const blobPromise = renderChartExportPng(chart, workouts);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  }

  async function handleSave() {
    const filename = (chart.name || "chart").replace(/[^a-zA-Z0-9]/g, "-");
    const filePath = await save({
      defaultPath: `${filename}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderChartExportPng(chart, workouts);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  return <ShareMenu onCopy={handleCopy} onSave={handleSave} />;
}
