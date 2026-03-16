import { useState, useEffect, useCallback, useMemo } from "react";
import { FIELD_DEFS } from "../lib/fields";
import { queryWorkouts, chartFiltersToWorkoutFilters } from "../lib/database";
import { useChartStore } from "../stores/chartStore";
import type { Workout, ChartMarkType, YAxisField, YAxisSide, FilterCondition } from "../types";
import { useDebounce, isConditionActive } from "./FilterEditors";
import ChartFilterBar from "./ChartFilterBar";
import ChartPlot from "./ChartPlot";

const NUMERIC_FIELDS = FIELD_DEFS.filter((f) => f.type === "number");
const ENUM_FIELDS = FIELD_DEFS.filter((f) => f.type === "enum");

export default function ChartBuilder() {
  const { draft, updateDraft, saveDraft, backToList } = useChartStore();
  const [previewWorkouts, setPreviewWorkouts] = useState<Workout[]>([]);
  const [saving, setSaving] = useState(false);

  // Only include complete filters so changing operator doesn't trigger a re-query
  // while the new filter is still being configured
  const activeFiltersKey = useMemo(
    () => JSON.stringify((draft?.filters ?? []).filter(isConditionActive)),
    [draft?.filters],
  );
  const debouncedFiltersKey = useDebounce(activeFiltersKey, 400);

  const fetchPreview = useCallback(async () => {
    if (!draft) return;
    const conditions = JSON.parse(debouncedFiltersKey) as FilterCondition[];
    const filters = chartFiltersToWorkoutFilters(conditions);
    const workouts = await queryWorkouts(filters);
    setPreviewWorkouts(workouts);
  }, [draft?.y_fields, draft?.group_by, draft?.mark_type, debouncedFiltersKey]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  if (!draft) return null;

  const handleSave = async () => {
    if (!draft.name.trim() || draft.y_fields.length === 0) return;
    setSaving(true);
    await saveDraft();
    setSaving(false);
  };

  const addYField = (field: string) => {
    if (draft.y_fields.length >= 2) return;
    const side: YAxisSide = draft.y_fields.length === 0 ? "left" : "right";
    updateDraft({ y_fields: [...draft.y_fields, { field, side }] });
  };

  const removeYField = (index: number) => {
    updateDraft({ y_fields: draft.y_fields.filter((_, i) => i !== index) });
  };

  const toggleSide = (index: number) => {
    const updated = draft.y_fields.map((f, i) =>
      i === index ? { ...f, side: (f.side === "left" ? "right" : "left") as YAxisSide } : f,
    );
    updateDraft({ y_fields: updated });
  };

  const usedFields = new Set(draft.y_fields.map((f) => f.field));
  const availableFields = NUMERIC_FIELDS.filter((f) => !usedFields.has(f.key));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={backToList}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 4L6 8l4 4" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={backToList}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!draft.name.trim() || draft.y_fields.length === 0 || saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Chart"}
          </button>
        </div>
      </div>

      {/* Name + Chart type row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Chart Name</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
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
                  checked={draft.mark_type === type}
                  onChange={() => updateDraft({ mark_type: type })}
                  className="text-blue-600"
                />
                <span className="capitalize">{type}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Y-axis fields + Group by row */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Y-Axis Fields {draft.y_fields.length > 0 && `(${draft.y_fields.length}/2)`}
          </label>
          <div className="space-y-2">
            {draft.y_fields.map((yf: YAxisField, i: number) => {
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

            {draft.y_fields.length < 2 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addYField(e.target.value);
                }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Add a Y-axis field...</option>
                {availableFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="w-48 shrink-0">
          <label className="mb-1 block text-sm font-medium text-gray-700">Group By (color)</label>
          <select
            value={draft.group_by ?? ""}
            onChange={(e) => updateDraft({ group_by: e.target.value || null })}
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

      {/* Filters */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Filters</label>
        <ChartFilterBar />
      </div>

      {/* Live preview */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Preview ({previewWorkouts.length} workouts)
        </label>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <ChartPlot chart={draft} workouts={previewWorkouts} height={300} />
        </div>
      </div>
    </div>
  );
}
