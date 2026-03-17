import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { InstructorCue } from "../lib/charts";
import { renderExportPng } from "../lib/exportUtils";
import type { Workout, PerformanceTimeSeries } from "../types";
import { useShareChartStore } from "../stores/shareChartStore";
import ShareMenu from "./ShareMenu";

interface ExportButtonProps {
  filename: string;
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
  cues?: InstructorCue[] | null;
  displayName?: string | null;
}

export default function ExportButton({ filename, workout, ftp, timeSeries, cues, displayName }: ExportButtonProps) {
  const settings = useShareChartStore((s) => s.settings);

  async function handleCopy() {
    const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName);
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  }

  async function handleSave() {
    const filePath = await save({
      defaultPath: `${filename}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  return <ShareMenu onCopy={handleCopy} onSave={handleSave} />;
}
