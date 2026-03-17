import { useState } from "react";
import type { DashboardWidget, MetricTotalWidgetConfig } from "../../types";
import { useDashboardStore } from "../../stores/dashboardStore";
import { PREDEFINED_METRICS } from "../../lib/dashboardDefaults";
import { FilterBar } from "../ChartFilterBar";
import type { FilterCondition } from "../../types";

interface Props {
  widget: DashboardWidget | null;
}

export default function MetricTotalConfig({ widget }: Props) {
  const addWidget = useDashboardStore((s) => s.addWidget);
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const cancelConfiguring = useDashboardStore((s) => s.cancelConfiguring);

  const existing = widget?.config.type === "metric_total" ? widget.config : null;

  const [metric, setMetric] = useState(existing?.metric ?? PREDEFINED_METRICS[0].key);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [filters, setFilters] = useState<FilterCondition[]>(existing?.filters ?? []);

  const metricDef = PREDEFINED_METRICS.find((m) => m.key === metric);

  const handleSave = () => {
    const config: MetricTotalWidgetConfig = {
      type: "metric_total",
      metric,
      label: label || metricDef?.label || metric,
      filters,
    };

    if (widget) {
      updateWidgetConfig(widget.id, config);
    } else {
      addWidget("metric_total", config);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Metric</label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {PREDEFINED_METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Display Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={metricDef?.label}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Filters (optional)</label>
        <FilterBar
          filters={filters}
          onAdd={(c) => setFilters((prev) => [...prev, c])}
          onUpdate={(id, updates) => setFilters((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))}
          onRemove={(id) => setFilters((prev) => prev.filter((c) => c.id !== id))}
        />
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
