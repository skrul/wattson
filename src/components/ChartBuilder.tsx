import { useState, useEffect, useCallback, useMemo } from "react";
import { FIELD_DEFS } from "../lib/fields";
import { useEnrichmentStore } from "../stores/enrichmentStore";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../lib/database";
import type { Workout, ChartDefinition, ChartMarkType, ChartXAxisMode, AggregationFunction, YAxisField, YAxisSide, FilterCondition } from "../types";
import { isAggregatedMode } from "../lib/charts";
import { useDebounce, isConditionActive } from "./FilterEditors";
import { FilterBar } from "./ChartFilterBar";
import { CHART_TEMPLATES } from "../lib/chartTemplates";
import ChartPlot from "./ChartPlot";

const NUMERIC_FIELDS = FIELD_DEFS.filter((f) => f.type === "number");
const ENUM_FIELDS = FIELD_DEFS.filter((f) => f.type === "enum");

type ChartFields = Omit<ChartDefinition, "id" | "created_at" | "updated_at">;

interface ChartBuilderProps {
  chart: ChartFields;
  onChange: (chart: ChartFields) => void;
}

export default function ChartBuilder({ chart, onChange }: ChartBuilderProps) {
  const enrichmentComplete = useEnrichmentStore((s) => s.enrichmentComplete);
  const [previewWorkouts, setPreviewWorkouts] = useState<Workout[]>([]);

  const update = (updates: Partial<ChartFields>) => {
    onChange({ ...chart, ...updates });
  };

  const activeFiltersKey = useMemo(
    () => JSON.stringify((chart.filters ?? []).filter(isConditionActive)),
    [chart.filters],
  );
  const debouncedFiltersKey = useDebounce(activeFiltersKey, 400);

  const fetchPreview = useCallback(async () => {
    const conditions = JSON.parse(debouncedFiltersKey) as FilterCondition[];
    const filters = chartFiltersToWorkoutFilters(conditions);
    const workouts = await queryWorkouts(filters);
    setPreviewWorkouts(workouts);
  }, [chart.y_fields, chart.group_by, chart.mark_type, debouncedFiltersKey]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const addYField = (field: string) => {
    if (chart.y_fields.length >= 2) return;
    const side: YAxisSide = chart.y_fields.length === 0 ? "left" : "right";
    update({ y_fields: [...chart.y_fields, { field, side }] });
  };

  const removeYField = (index: number) => {
    update({ y_fields: chart.y_fields.filter((_, i) => i !== index) });
  };

  const toggleSide = (index: number) => {
    const updated = chart.y_fields.map((f, i) =>
      i === index ? { ...f, side: (f.side === "left" ? "right" : "left") as YAxisSide } : f,
    );
    update({ y_fields: updated });
  };

  const usedFields = new Set(chart.y_fields.map((f) => f.field));
  const availableFields = NUMERIC_FIELDS.filter((f) => !usedFields.has(f.key));

  const previewChart: ChartDefinition = useMemo(() => ({
    id: "preview",
    ...chart,
    created_at: 0,
    updated_at: 0,
  }), [chart]);

  return (
    <div className="space-y-6">
      {/* Load Template */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Load Template</label>
        <select
          value=""
          onChange={(e) => {
            const template = CHART_TEMPLATES.find((t) => t.id === e.target.value);
            if (template) {
              const { id: _, created_at: _c, updated_at: _u, ...fields } = template;
              onChange(fields);
            }
          }}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select a template...</option>
          {CHART_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Section 1: Name & Type */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Name & Type</legend>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Chart Name</label>
            <input
              type="text"
              value={chart.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g., Cycling Output Over Time"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Chart Type</label>
            <div className="flex gap-4 py-2">
              {(["line", "dot", "bar"] as ChartMarkType[]).map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mark_type"
                    checked={chart.mark_type === type}
                    onChange={() => update({ mark_type: type })}
                    className="text-blue-600"
                  />
                  <span className="capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      {/* Section 2: X-Axis */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">X-Axis</legend>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium text-gray-700">Mode</label>
            <select
              value={chart.x_axis_mode}
              onChange={(e) => {
                const mode = e.target.value as ChartXAxisMode;
                const updates: Partial<ChartFields> = { x_axis_mode: mode };
                if (isAggregatedMode(mode)) {
                  if (!chart.agg_function) updates.agg_function = "avg";
                  if (mode !== "category") updates.x_axis_field = null;
                } else {
                  updates.agg_function = null;
                  updates.x_axis_field = null;
                }
                update(updates);
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="date">Date</option>
              <option value="day">By Day</option>
              <option value="week">By Week</option>
              <option value="month">By Month</option>
              <option value="year">By Year</option>
              <option value="category">By Category</option>
            </select>
          </div>
          {chart.x_axis_mode === "category" && (
            <div className="w-48">
              <label className="mb-1 block text-sm font-medium text-gray-700">Field</label>
              <select
                value={chart.x_axis_field ?? ""}
                onChange={(e) => update({ x_axis_field: e.target.value || null })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select a field...</option>
                {ENUM_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          )}
          {isAggregatedMode(chart.x_axis_mode) && (
            <div className="w-36">
              <label className="mb-1 block text-sm font-medium text-gray-700">Aggregation</label>
              <select
                value={chart.agg_function ?? "avg"}
                onChange={(e) => {
                  const agg = e.target.value as AggregationFunction;
                  const updates: Partial<ChartFields> = { agg_function: agg };
                  // Count doesn't use the y-axis metric, but the chart renderer still
                  // needs at least one y_field. Auto-add a placeholder if empty.
                  if (agg === "count" && chart.y_fields.length === 0) {
                    updates.y_fields = [{ field: NUMERIC_FIELDS[0].key, side: "left" as YAxisSide }];
                  }
                  update(updates);
                }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="avg">Average</option>
                <option value="sum">Sum</option>
                <option value="count">Count</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
            </div>
          )}
          {isAggregatedMode(chart.x_axis_mode) && (
            <div className="w-24">
              <label className="mb-1 block text-sm font-medium text-gray-700">Min</label>
              <input
                type="number"
                value={chart.min_value ?? ""}
                onChange={(e) => update({ min_value: e.target.value ? Number(e.target.value) : null })}
                placeholder="None"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
          {chart.x_axis_mode !== "category" && (
            <div className="pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chart.x_axis_sequential}
                  onChange={(e) => update({ x_axis_sequential: e.target.checked })}
                  className="text-blue-600"
                />
                <span className="whitespace-nowrap">Evenly spaced</span>
              </label>
            </div>
          )}
        </div>
      </fieldset>

      {/* Section 3: Y-Axis (hidden when count aggregation is active — count ignores the metric) */}
      {!(isAggregatedMode(chart.x_axis_mode) && chart.agg_function === "count") && (
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Y-Axis</legend>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Fields {chart.y_fields.length > 0 && `(${chart.y_fields.length}/2)`}
            </label>
            <div className="space-y-2">
              {chart.y_fields.map((yf: YAxisField, i: number) => {
                const fieldDef = NUMERIC_FIELDS.find((f) => f.key === yf.field);
                return (
                  <div key={yf.field} className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="flex-1 text-sm">{fieldDef?.label ?? yf.field}</span>
                    <button
                      onClick={() => toggleSide(i)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      {yf.side === "left" ? "Left axis" : "Right axis"}
                    </button>
                    <button
                      onClick={() => removeYField(i)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                );
              })}

              {chart.y_fields.length < 2 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addYField(e.target.value);
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Add a Y-axis field...</option>
                  {availableFields.map((f) => {
                    const disabled = f.requiresDetail && !enrichmentComplete;
                    return (
                      <option key={f.key} value={f.key} disabled={disabled}>
                        {f.label}{disabled ? " (detailed mode)" : ""}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          </div>

          <div className="w-48 shrink-0">
            <label className="mb-1 block text-sm font-medium text-gray-700">Group By (color)</label>
            <select
              value={chart.group_by ?? ""}
              onChange={(e) => update({ group_by: e.target.value || null })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">None</option>
              {ENUM_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      )}

      {/* Section 4: Filters */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Filters</legend>
        <FilterBar
          filters={chart.filters}
          onAdd={(c) => update({ filters: [...chart.filters, c] })}
          onUpdate={(id, updates) => update({ filters: chart.filters.map((c) => (c.id === id ? { ...c, ...updates } : c)) })}
          onRemove={(id) => update({ filters: chart.filters.filter((c) => c.id !== id) })}
        />
      </fieldset>

      {/* Section 5: Display options */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Display</legend>
        <div className="flex flex-wrap items-center gap-4">
          {chart.mark_type === "bar" && (chart.x_axis_mode === "category" || chart.x_axis_sequential) && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chart.transposed}
                onChange={(e) => update({ transposed: e.target.checked })}
                className="text-blue-600"
              />
              <span className="whitespace-nowrap">Horizontal bars</span>
            </label>
          )}
          {!chart.group_by && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Color</label>
              <input
                type="color"
                value={chart.color ?? "#2563eb"}
                onChange={(e) => update({ color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-gray-300"
              />
              {chart.color && (
                <button
                  onClick={() => update({ color: null })}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </fieldset>

      {/* Live preview */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Preview ({previewWorkouts.length} workouts)
        </label>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <ChartPlot chart={previewChart} workouts={previewWorkouts} height={300} />
        </div>
      </div>
    </div>
  );
}
