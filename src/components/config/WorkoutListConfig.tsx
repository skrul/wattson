import { useState } from "react";
import type { DashboardWidget, WorkoutListWidgetConfig, FilterCondition } from "../../types";
import { useDashboardContext } from "../../stores/DashboardContext";
import { FilterBar } from "../ChartFilterBar";

interface Props {
  widget: DashboardWidget | null;
}

export default function WorkoutListConfig({ widget }: Props) {
  const useStore = useDashboardContext();
  const addWidget = useStore((s) => s.addWidget);
  const updateWidgetConfig = useStore((s) => s.updateWidgetConfig);
  const cancelConfiguring = useStore((s) => s.cancelConfiguring);

  const existing = widget?.config.type === "workout_list" ? widget.config : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [limit, setLimit] = useState(existing?.limit ?? 10);
  const [filters, setFilters] = useState<FilterCondition[]>(existing?.filters ?? []);

  const handleSave = () => {
    const config: WorkoutListWidgetConfig = {
      type: "workout_list",
      title: title || "Recent Workouts",
      limit: Math.max(1, Math.min(50, limit)),
      filters,
    };

    if (widget) {
      updateWidgetConfig(widget.id, config);
    } else {
      addWidget("workout_list", config);
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
          placeholder="Recent Workouts"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Number of workouts</label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          min={1}
          max={50}
          className="w-32 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
