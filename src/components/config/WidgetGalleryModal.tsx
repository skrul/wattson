import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useDashboardContext } from "../../stores/DashboardContext";
import { WIDGET_TYPES, WIDGET_PRESETS } from "../../lib/widgetPresets";
import { WIDGET_DEFAULTS } from "../../lib/dashboardDefaults";
import type { WidgetPreset } from "../../lib/widgetPresets";
import type { DashboardWidget, WidgetType } from "../../types";
import ChartWidget from "../widgets/ChartWidget";
import MetricTotalWidget from "../widgets/MetricTotalWidget";
import LastWorkoutWidget from "../widgets/LastWorkoutWidget";
import ActivityGridWidget from "../widgets/ActivityGridWidget";
import PersonalRecordWidget from "../widgets/PersonalRecordWidget";
import MostRepeatedWidget from "../widgets/MostRepeatedWidget";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Build a fake DashboardWidget for rendering a preview. */
function makeFakeWidget(type: WidgetType, preset: WidgetPreset): DashboardWidget {
  const defaults = WIDGET_DEFAULTS[type];
  return {
    id: `preview-${preset.id}`,
    widget_type: type,
    config: preset.config,
    layout: { x: 0, y: 0, w: defaults.defaultW, h: defaults.defaultH },
  };
}

/** Render the actual widget component for a preview. */
function WidgetPreview({ widget }: { widget: DashboardWidget }) {
  switch (widget.config.type) {
    case "metric_total":
      return <MetricTotalWidget widget={widget} />;
    case "chart":
      return <ChartWidget widget={widget} />;
    case "personal_record":
      return <PersonalRecordWidget widget={widget} />;
    case "activity_grid":
      return <ActivityGridWidget widget={widget} />;
    case "most_repeated":
      return <MostRepeatedWidget widget={widget} />;
    case "last_workout":
      return <LastWorkoutWidget widget={widget} />;
    default:
      return null;
  }
}

/** Card sizing per widget type. */
const CARD_SIZES: Record<WidgetType, { width: string; height: string; cols: string }> = {
  metric_total:    { width: "200px", height: "120px", cols: "repeat(auto-fill, minmax(200px, 1fr))" },
  chart:           { width: "280px", height: "200px", cols: "repeat(auto-fill, minmax(280px, 1fr))" },
  personal_record: { width: "200px", height: "160px", cols: "repeat(auto-fill, minmax(200px, 1fr))" },
  activity_grid:   { width: "100%",  height: "140px", cols: "1fr" },
  most_repeated:   { width: "280px", height: "200px", cols: "repeat(auto-fill, minmax(280px, 1fr))" },
  last_workout:    { width: "280px", height: "200px", cols: "repeat(auto-fill, minmax(280px, 1fr))" },
  section:         { width: "200px", height: "120px", cols: "repeat(auto-fill, minmax(200px, 1fr))" },
};

export default function WidgetGalleryModal({ open, onClose }: Props) {
  const useStore = useDashboardContext();
  const addWidget = useStore((s) => s.addWidget);
  const startAddingWidget = useStore((s) => s.startAddingWidget);
  const [selectedType, setSelectedType] = useState<WidgetType>("metric_total");

  const presets = WIDGET_PRESETS[selectedType] ?? [];
  const sizing = CARD_SIZES[selectedType];

  function handlePresetClick(type: WidgetType, preset: WidgetPreset) {
    addWidget(type, preset.config);
    onClose();
  }

  function handleCustomClick(type: WidgetType) {
    onClose();
    startAddingWidget(type);
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
          {/* Left panel — type list */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-2">
            <DialogTitle className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Widget Types
            </DialogTitle>
            {WIDGET_TYPES.map(({ type, label, description }) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors ${
                  selectedType === type
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-gray-500">{description}</span>
              </button>
            ))}
          </div>

          {/* Right panel — preset grid */}
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">
              {WIDGET_TYPES.find((t) => t.type === selectedType)?.label}
            </h3>
            <div className="grid gap-4" style={{ gridTemplateColumns: sizing.cols }}>
              {/* Custom card — always first */}
              <button
                onClick={() => handleCustomClick(selectedType)}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-blue-400 hover:bg-blue-50"
                style={{ minHeight: sizing.height }}
              >
                <svg className="mb-2 h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 4v16M4 12h16" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium text-gray-600">Custom</span>
                <span className="text-xs text-gray-400">Configure from scratch</span>
              </button>

              {/* Preset cards with live previews */}
              {presets.map((preset) => {
                const fakeWidget = makeFakeWidget(selectedType, preset);
                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(selectedType, preset)}
                    className="group/card flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition-shadow hover:shadow-md hover:ring-2 hover:ring-blue-400"
                  >
                    <div
                      className="pointer-events-none overflow-hidden p-2"
                      style={{ height: sizing.height }}
                    >
                      <WidgetPreview widget={fakeWidget} />
                    </div>
                    <div className="border-t border-gray-100 px-3 py-2">
                      <span className="text-xs font-medium text-gray-700">{preset.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
