import { useState, useEffect, useCallback, useMemo } from "react";
import { FIELD_DEFS } from "../lib/fields";
import { useEnrichmentStore } from "../stores/enrichmentStore";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../lib/database";
import type { Workout, ChartDefinition, ChartMarkType, ChartXAxisMode, AggregationFunction, YAxisField, YAxisSide, FilterCondition } from "../types";
import { isAggregatedMode, seriesColor } from "../lib/charts";
import { useDebounce, isConditionActive } from "./FilterEditors";
import { FilterBar } from "./ChartFilterBar";
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
    const side: YAxisSide = chart.y_fields.length === 0 ? "left" : "none";
    update({ y_fields: [...chart.y_fields, { field, side, color: null, trend_line: false, trend_line_window: null }] });
  };

  const updateYField = (index: number, updates: Partial<YAxisField>) => {
    const updated = chart.y_fields.map((f, i) =>
      i === index ? { ...f, ...updates } : f,
    );
    update({ y_fields: updated });
  };

  const removeYField = (index: number) => {
    update({ y_fields: chart.y_fields.filter((_, i) => i !== index) });
  };

  const setPrimary = (index: number) => {
    const updated = chart.y_fields.map((f, i) => {
      if (i === index) return { ...f, side: "left" as YAxisSide };
      if (f.side === "left") return { ...f, side: "none" as YAxisSide };
      return f;
    });
    update({ y_fields: updated });
  };

  const setSecondary = (index: number) => {
    const updated = chart.y_fields.map((f, i) => {
      if (i === index) return { ...f, side: f.side === "right" ? ("none" as YAxisSide) : ("right" as YAxisSide) };
      if (f.side === "right") return { ...f, side: "none" as YAxisSide };
      return f;
    });
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
    <div className="space-y-4">
      {/* Sticky preview at top */}
      <div className="sticky top-0 z-10 -mx-6 -mt-2 bg-white px-6 pb-3 pt-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Preview ({previewWorkouts.length} workouts)
        </label>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <ChartPlot chart={previewChart} workouts={previewWorkouts} height={250} />
        </div>
      </div>

      {/* Row 1: Template + Name & Type side by side */}
      <div className="grid grid-cols-2 gap-4">
        <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Name & Type</legend>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Chart Name</label>
              <input
                type="text"
                value={chart.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g., Cycling Output Over Time"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Type</label>
              {(["line", "dot", "bar"] as ChartMarkType[]).map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm">
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
        </fieldset>

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
                    if (agg === "count" && chart.y_fields.length === 0) {
                      updates.y_fields = [{ field: NUMERIC_FIELDS[0].key, side: "left" as YAxisSide, color: null, trend_line: false, trend_line_window: null }];
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
      </div>

      {/* Row 2: Y-Axis & Display combined */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Y-Axis & Display</legend>
        <div className="space-y-3">
          {/* Per-field rows (hidden when count aggregation is active) */}
          {!(isAggregatedMode(chart.x_axis_mode) && chart.agg_function === "count") && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Fields {chart.y_fields.length > 0 && `(${chart.y_fields.length})`}
              </label>
              <div className="space-y-2">
                {chart.y_fields.map((yf: YAxisField, i: number) => {
                  const fieldDef = NUMERIC_FIELDS.find((f) => f.key === yf.field);
                  const showColor = !chart.group_by;
                  const showTrend = (chart.mark_type === "line" || chart.mark_type === "dot") &&
                    chart.x_axis_mode !== "category" && !chart.group_by;
                  const defaultColor = seriesColor(i, null);
                  return (
                    <div key={yf.field} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                      <span className="text-sm font-medium">{fieldDef?.label ?? yf.field}</span>
                      {showColor && (
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={yf.color ?? defaultColor}
                            onChange={(e) => updateYField(i, { color: e.target.value })}
                            className="h-6 w-6 cursor-pointer rounded border border-gray-300"
                          />
                          {yf.color && (
                            <button
                              onClick={() => updateYField(i, { color: null })}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                      {showTrend && (
                        <>
                          <label className="flex cursor-pointer items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={yf.trend_line ?? false}
                              onChange={(e) => updateYField(i, { trend_line: e.target.checked })}
                              className="text-blue-600"
                            />
                            <span className="whitespace-nowrap">Trend</span>
                          </label>
                          {yf.trend_line && (
                            <input
                              type="number"
                              value={yf.trend_line_window ?? 7}
                              min={2}
                              max={50}
                              onChange={(e) => updateYField(i, { trend_line_window: e.target.value ? Number(e.target.value) : null })}
                              className="w-14 rounded border border-gray-300 px-1.5 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          )}
                        </>
                      )}
                      <button
                        onClick={() => removeYField(i)}
                        className="ml-auto text-gray-400 hover:text-red-500"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  );
                })}

                {availableFields.length > 0 && (
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
          )}

          {/* Chart-level controls */}
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
            {chart.y_fields.length >= 2 && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Primary axis</label>
                  <select
                    value={chart.y_fields.findIndex((f) => f.side === "left")}
                    onChange={(e) => setPrimary(Number(e.target.value))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {chart.y_fields.map((yf, i) => {
                      const fd = NUMERIC_FIELDS.find((f) => f.key === yf.field);
                      return <option key={yf.field} value={i}>{fd?.label ?? yf.field}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Secondary axis</label>
                  <select
                    value={chart.y_fields.findIndex((f) => f.side === "right")}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (idx < 0) {
                        // Clear secondary: set any "right" field to "none"
                        const updated = chart.y_fields.map((f) =>
                          f.side === "right" ? { ...f, side: "none" as YAxisSide } : f,
                        );
                        update({ y_fields: updated });
                      } else {
                        setSecondary(idx);
                      }
                    }}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value={-1}>None</option>
                    {chart.y_fields.map((yf, i) => {
                      const fd = NUMERIC_FIELDS.find((f) => f.key === yf.field);
                      return <option key={yf.field} value={i}>{fd?.label ?? yf.field}</option>;
                    })}
                  </select>
                </div>
              </>
            )}
            <div>
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
        </div>
      </fieldset>

      {/* Row 3: Filters (full width) */}
      <fieldset className="rounded-lg border border-gray-200 px-4 pb-3 pt-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Filters</legend>
        <FilterBar
          filters={chart.filters}
          onAdd={(c) => update({ filters: [...chart.filters, c] })}
          onUpdate={(id, updates) => update({ filters: chart.filters.map((c) => (c.id === id ? { ...c, ...updates } : c)) })}
          onRemove={(id) => update({ filters: chart.filters.filter((c) => c.id !== id) })}
        />
      </fieldset>
    </div>
  );
}
