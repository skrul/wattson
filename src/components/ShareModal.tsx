import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Workout, PerformanceTimeSeries } from "../types";
import type { InstructorCue } from "../lib/charts";
import { isPowerZoneRide } from "../lib/charts";
import { renderExportPng, resolveBackgroundImageSrc, computeExportDimensions, type AspectRatioPreset } from "../lib/exportUtils";
import { useShareChartStore, resolveDisplayName } from "../stores/shareChartStore";
import { useSessionStore } from "../stores/sessionStore";
import ChartCard from "./ChartCard";

const ASPECT_RATIO_OPTIONS: { value: AspectRatioPreset; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
];

const LS_KEY = "share-modal-aspect-ratio";

function loadSavedRatio(): AspectRatioPreset {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "16:9" || v === "1:1" || v === "4:5") return v;
  } catch { /* ignore */ }
  return "16:9";
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  workout: Workout;
  ftp: number | null;
  timeSeries: PerformanceTimeSeries;
  cues?: InstructorCue[] | null;
}

export default function ShareModal({ open, onClose, workout, ftp, timeSeries, cues }: ShareModalProps) {
  const styles = useShareChartStore((s) => s.styles);
  const activeStyleId = useShareChartStore((s) => s.activeStyleId);
  const userProfile = useSessionStore((s) => s.userProfile);

  const [selectedStyleId, setSelectedStyleId] = useState(activeStyleId);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(loadSavedRatio);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === selectedStyleId) ?? styles[0],
    [styles, selectedStyleId],
  );
  const settings = selectedStyle.settings;

  const pelotonUsername = useMemo(() => {
    if (!userProfile?.raw_json) return null;
    try { return (JSON.parse(userProfile.raw_json).username as string) ?? null; } catch { return null; }
  }, [userProfile?.raw_json]);

  const displayName = resolveDisplayName(settings, pelotonUsername);
  const isPZ = isPowerZoneRide(workout);

  const backgroundImageSrc = useMemo(
    () => resolveBackgroundImageSrc(settings, workout.raw_ride_details_json),
    [settings, workout.raw_ride_details_json],
  );

  const dims = useMemo(() => {
    const st = settings.stats;
    const hasStats = !!(
      (st.avgPower && workout.avg_output != null) ||
      (st.totalOutput && workout.total_work != null) ||
      (st.calories && workout.calories != null) ||
      (st.distance && workout.distance != null) ||
      (st.avgCadence && workout.avg_cadence != null) ||
      (st.avgResistance && workout.avg_resistance != null) ||
      (st.avgSpeed && workout.avg_speed != null) ||
      (st.avgHR && workout.avg_heart_rate != null) ||
      (st.striveScore && workout.strive_score != null) ||
      (st.ftp && ftp != null)
    );
    return computeExportDimensions(aspectRatio, settings.showHeader, hasStats);
  }, [aspectRatio, settings, workout, ftp]);

  const filename = `${workout.title?.replace(/[^a-zA-Z0-9]/g, "-") ?? "workout"}-${workout.id.slice(0, 8)}`;

  function handleRatioChange(ratio: AspectRatioPreset) {
    setAspectRatio(ratio);
    try { localStorage.setItem(LS_KEY, ratio); } catch { /* ignore */ }
  }

  const handleCopy = useCallback(async () => {
    setCopyStatus("copying");
    try {
      const blobPromise = renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc, aspectRatio);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blobPromise }),
      ]);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc, aspectRatio]);

  const handleSave = useCallback(async () => {
    const filePath = await save({
      defaultPath: `${filename}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!filePath) return;
    const blob = await renderExportPng(workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc, aspectRatio);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
  }, [workout, ftp, timeSeries, cues, settings, displayName, backgroundImageSrc, aspectRatio, filename]);

  const copyLabel = copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Failed" : copyStatus === "copying" ? "Copying..." : "Copy to Clipboard";

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          {/* Top bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
            <DialogTitle className="text-base font-semibold text-gray-900">Share</DialogTitle>
            <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Options row */}
          <div className="flex shrink-0 items-center gap-4 border-b border-gray-100 px-5 py-2.5">
            {/* Aspect ratio segmented control */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">Ratio</span>
              <div className="inline-flex rounded-md border border-gray-300">
                {ASPECT_RATIO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleRatioChange(opt.value)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                      aspectRatio === opt.value
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style picker */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">Style</span>
              <select
                value={selectedStyleId}
                onChange={(e) => setSelectedStyleId(e.target.value)}
                className="rounded border border-gray-300 px-1.5 py-1 text-xs"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div
              className="mx-auto"
              style={{
                maxWidth: "100%",
                aspectRatio: `${dims.exportWidth} / ${dims.totalHeight}`,
              }}
            >
              <ChartCard
                workout={workout}
                ftp={ftp}
                timeSeries={timeSeries}
                cues={cues ?? null}
                settings={settings}
                displayName={displayName}
                isPZ={isPZ}
                backgroundImageSrc={backgroundImageSrc}
                fitHeight
              />
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 px-5 py-3">
            <button
              onClick={handleCopy}
              disabled={copyStatus === "copying"}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1" />
                <path d="M11 5V3C11 2.44772 10.5523 2 10 2H3C2.44772 2 2 2.44772 2 3V10C2 10.5523 2.44772 11 3 11H5" />
              </svg>
              {copyLabel}
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2V11" />
                <path d="M5 8L8 11L11 8" />
                <path d="M2 13H14" />
              </svg>
              Save as PNG
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
