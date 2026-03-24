import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { InstructorCue } from "../lib/charts";
import { renderExportPng } from "../lib/exportUtils";
import type { Workout, PerformanceTimeSeries, ShareChartSettings } from "../types";
import { useShareChartStore } from "../stores/shareChartStore";
import ShareMenu from "./ShareMenu";

interface ExportButtonProps {
  filename: string;
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
  cues?: InstructorCue[] | null;
  displayName?: string | null;
  settings?: ShareChartSettings;
  backgroundImageSrc?: string | null;
}

export default function ExportButton({ filename, workout, ftp, timeSeries, cues, displayName, settings: settingsProp, backgroundImageSrc }: ExportButtonProps) {
  const storeSettings = useShareChartStore((s) => s.settings);
  const settings = settingsProp ?? storeSettings;

  async function handleCopy() {
    const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
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
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }

  return <ShareMenu onCopy={handleCopy} onSave={handleSave} />;
}
