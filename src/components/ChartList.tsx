import { useEffect } from "react";
import { useChartStore } from "../stores/chartStore";
import { FIELD_MAP } from "../lib/fields";
import { CHART_TEMPLATES } from "../lib/chartTemplates";
import type { ChartDefinition } from "../types";
import { isConditionActive } from "./FilterEditors";

function ChartCard({ chart }: { chart: ChartDefinition }) {
  const { viewChart, editChart, removeChart } = useChartStore();

  const yLabels = chart.y_fields
    .map((f) => FIELD_MAP[f.field]?.label ?? f.field)
    .join(", ");

  const activeFilterCount = chart.filters.filter(isConditionActive).length;

  return (
    <div
      onClick={() => viewChart(chart)}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-medium text-gray-900">{chart.name || "Untitled"}</h3>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => editChart(chart)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Edit"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${chart.name || "Untitled"}"?`)) removeChart(chart.id);
            }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title="Delete"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4h10M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="capitalize">{chart.mark_type}</span>
          <span>·</span>
          <span>{yLabels}</span>
        </div>
        {chart.group_by && (
          <div>Grouped by {FIELD_MAP[chart.group_by]?.label ?? chart.group_by}</div>
        )}
        {activeFilterCount > 0 && (
          <div>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}</div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ chart }: { chart: ChartDefinition }) {
  const { viewChart } = useChartStore();

  const yLabels = chart.y_fields
    .map((f) => FIELD_MAP[f.field]?.label ?? f.field)
    .join(", ");

  return (
    <div
      onClick={() => viewChart(chart)}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <h3 className="mb-2 font-medium text-gray-900">{chart.name}</h3>
      <div className="space-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="capitalize">{chart.mark_type}</span>
          <span>·</span>
          <span>{yLabels}</span>
        </div>
        {chart.group_by && (
          <div>Grouped by {FIELD_MAP[chart.group_by]?.label ?? chart.group_by}</div>
        )}
      </div>
    </div>
  );
}

export default function ChartList() {
  const { charts, loadCharts, createNew } = useChartStore();

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Charts</h2>
        <button
          onClick={createNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 2v12M2 8h12" />
          </svg>
          New Chart
        </button>
      </div>

      {/* Templates */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-gray-500">Templates</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHART_TEMPLATES.map((t) => (
            <TemplateCard key={t.id} chart={t} />
          ))}
        </div>
      </div>

      {/* Custom charts */}
      {charts.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-500">My Charts</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {charts.map((chart) => (
              <ChartCard key={chart.id} chart={chart} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
