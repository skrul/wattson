import { useState } from "react";
import type { DashboardWidget, SectionWidgetConfig } from "../../types";
import { useDashboardStore } from "../../stores/dashboardStore";

interface Props {
  widget: DashboardWidget | null;
}

export default function SectionConfig({ widget }: Props) {
  const addWidget = useDashboardStore((s) => s.addWidget);
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const cancelConfiguring = useDashboardStore((s) => s.cancelConfiguring);

  const existing = widget?.config.type === "section" ? widget.config : null;

  const [title, setTitle] = useState(existing?.title ?? "");

  const handleSave = () => {
    const config: SectionWidgetConfig = { type: "section", title: title || "Section" };

    if (widget) {
      updateWidgetConfig(widget.id, config);
    } else {
      addWidget("section", config);
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
          placeholder="Section"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
