import { useState } from "react";
import type { DashboardWidget, ChartWidgetConfig as ChartWidgetConfigType, ChartDefinition } from "../../types";
import { useDashboardStore } from "../../stores/dashboardStore";
import ChartBuilder from "../ChartBuilder";

interface Props {
  widget: DashboardWidget | null;
}

type ChartFields = Omit<ChartDefinition, "id" | "created_at" | "updated_at">;

function makeEmptyChart(): ChartFields {
  return {
    name: "",
    mark_type: "line",
    y_fields: [],
    group_by: null,
    filters: [],
    x_axis_mode: "date",
    x_axis_field: null,
    x_axis_sequential: false,
    agg_function: null,
  };
}

export default function ChartWidgetConfig({ widget }: Props) {
  const addWidget = useDashboardStore((s) => s.addWidget);
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const cancelConfiguring = useDashboardStore((s) => s.cancelConfiguring);

  const existing = widget?.config.type === "chart" ? widget.config.chart : null;
  const [chart, setChart] = useState<ChartFields>(existing ?? makeEmptyChart());

  const handleSave = () => {
    if (chart.y_fields.length === 0) return;
    const config: ChartWidgetConfigType = { type: "chart", chart };

    if (widget) {
      updateWidgetConfig(widget.id, config);
    } else {
      addWidget("chart", config);
    }
  };

  return (
    <div className="space-y-4">
      <ChartBuilder chart={chart} onChange={setChart} />

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={cancelConfiguring}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={chart.y_fields.length === 0}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {widget ? "Update" : "Add Widget"}
        </button>
      </div>
    </div>
  );
}
