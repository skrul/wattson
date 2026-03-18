import { useState } from "react";
import type { DashboardWidget, LastWorkoutWidgetConfig, FilterCondition } from "../../types";
import { useDashboardContext } from "../../stores/DashboardContext";
import { useShareChartStore } from "../../stores/shareChartStore";
import { FilterBar } from "../ChartFilterBar";

interface Props {
  widget: DashboardWidget | null;
}

export default function LastWorkoutConfig({ widget }: Props) {
  const useStore = useDashboardContext();
  const addWidget = useStore((s) => s.addWidget);
  const updateWidgetConfig = useStore((s) => s.updateWidgetConfig);
  const cancelConfiguring = useStore((s) => s.cancelConfiguring);

  const chartStyles = useShareChartStore((s) => s.styles);
  const activeStyleId = useShareChartStore((s) => s.activeStyleId);

  const existing = widget?.config.type === "last_workout" ? widget.config : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [filters, setFilters] = useState<FilterCondition[]>(existing?.filters ?? []);
  const [showHeader, setShowHeader] = useState(existing?.showHeader ?? true);
  const [showFooter, setShowFooter] = useState(existing?.showFooter ?? true);
  const [chartStyleId, setChartStyleId] = useState(existing?.chartStyleId ?? "");

  const handleSave = () => {
    const config: LastWorkoutWidgetConfig = { type: "last_workout", title, filters, showHeader, showFooter, chartStyleId: chartStyleId || undefined };

    if (widget) {
      updateWidgetConfig(widget.id, config);
    } else {
      addWidget("last_workout", config);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Last Workout"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Filters (optional)</label>
        <p className="mb-2 text-xs text-gray-500">
          Shows the most recent workout matching these filters. Leave empty to show the latest workout overall.
        </p>
        <FilterBar
          filters={filters}
          onAdd={(c) => setFilters((prev) => [...prev, c])}
          onUpdate={(id, updates) => setFilters((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))}
          onRemove={(id) => setFilters((prev) => prev.filter((c) => c.id !== id))}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Display Options</label>
        <div className="space-y-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showHeader}
              onChange={(e) => setShowHeader(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Show header (title, instructor, date)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showFooter}
              onChange={(e) => setShowFooter(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Show footer stats
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Chart Style</label>
        <select
          value={chartStyleId}
          onChange={(e) => setChartStyleId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Active style ({chartStyles.find((s) => s.id === activeStyleId)?.name ?? "Default"})</option>
          {chartStyles.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Chart styles can be configured in the Studio tab.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={cancelConfiguring}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {widget ? "Update" : "Add Widget"}
        </button>
      </div>
    </div>
  );
}
