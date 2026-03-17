import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { useDashboardStore } from "../../stores/dashboardStore";
import type { WidgetType } from "../../types";

const WIDGET_TYPES: { type: WidgetType; label: string; description: string }[] = [
  { type: "metric_total", label: "Metric Total", description: "Display a single aggregate value" },
  { type: "chart", label: "Chart", description: "Custom chart with the chart builder" },
  { type: "last_workout", label: "Last Workout", description: "Performance chart for the most recent matching workout" },
  { type: "section", label: "Section", description: "Full-width separator to organize widgets" },
];

export default function AddWidgetMenu({ primary }: { primary?: boolean }) {
  const startAddingWidget = useDashboardStore((s) => s.startAddingWidget);

  const buttonClass = primary
    ? "inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50";

  return (
    <Popover className="relative">
      <PopoverButton className={buttonClass}>
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2v12M2 8h12" />
        </svg>
        Add Widget
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        className="z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      >
        {({ close }) => (
          <>
            {WIDGET_TYPES.map(({ type, label, description }) => (
              <button
                key={type}
                onClick={() => {
                  startAddingWidget(type);
                  close();
                }}
                className="flex w-full flex-col px-4 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-xs text-gray-500">{description}</span>
              </button>
            ))}
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
