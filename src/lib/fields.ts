import type { FieldType, FilterCondition, FilterOperator } from "../types";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  operators: FilterOperator[];
  filterable: boolean;
  sortable: boolean;
  /** Format a raw DB value for display in the UI. */
  displayValue?: (raw: string) => string;
  /** Extra SQL WHERE clause for distinct-value queries (e.g. "workout_type = 'class'"). */
  distinctFilter?: string;
  /** True if this field requires detailed enrichment (performance_graph data). */
  requiresDetail?: boolean;
  /** Fixed set of values for virtual enum fields (bypasses DB distinct query). */
  staticValues?: string[];
  /** Custom SQL clause builder for virtual fields that don't map to a column. */
  buildClause?: (cond: FilterCondition, params: unknown[], idx: { val: number }) => string | null;
  /** Field key whose active values scope this field's enum options (e.g. "discipline" scopes class_type). */
  scopedBy?: string;
}

const STRING_OPS: FilterOperator[] = [
  "equals", "not_equals", "contains", "not_contains",
  "starts_with", "ends_with", "is_empty", "is_not_empty",
];

const NUMBER_OPS: FilterOperator[] = [
  "equals", "not_equals", "gt", "gte", "lt", "lte",
  "is_empty", "is_not_empty",
];

const ENUM_OPS: FilterOperator[] = [
  "equals", "not_equals", "is_empty", "is_not_empty",
];

const DATE_OPS: FilterOperator[] = [
  "equals", "before", "after", "last_n_days", "between", "is_empty", "is_not_empty",
];

export const FIELD_DEFS: FieldDef[] = [
  { key: "date", label: "Date", type: "date", operators: DATE_OPS, filterable: true, sortable: true },
  { key: "title", label: "Title", type: "string", operators: STRING_OPS, filterable: true, sortable: true },
  { key: "instructor", label: "Instructor", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "discipline", label: "Discipline", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "duration_seconds", label: "Duration", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true, displayValue: (v) => `${Math.round(Number(v) / 60)} min`, distinctFilter: "workout_type = 'class'" },
  { key: "total_work", label: "Total Output (kj)", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "avg_output", label: "Avg Output (watts)", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "calories", label: "Calories", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "distance", label: "Distance", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "avg_heart_rate", label: "Avg Heart Rate", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "avg_cadence", label: "Avg Cadence", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "avg_resistance", label: "Avg Resistance", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "avg_speed", label: "Avg Speed", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true, requiresDetail: true },
  { key: "strive_score", label: "Strive Score", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "workout_type", label: "Workout Type", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "is_live", label: "Live/On-Demand", type: "enum", operators: ENUM_OPS, filterable: true, sortable: false },
  { key: "class_type", label: "Class Type", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true, scopedBy: "discipline", requiresDetail: true },
  { key: "class_subtype", label: "Class Subtype", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true, scopedBy: "class_type", requiresDetail: true },
  {
    key: "is_repeat",
    label: "Repeated Ride",
    type: "enum",
    operators: ENUM_OPS,
    filterable: true,
    sortable: false,
    staticValues: ["Yes", "No"],
    buildClause: (cond) => {
      if (cond.operator === "is_empty" || cond.operator === "is_not_empty") return null;
      const sub = "(SELECT ride_id FROM workouts WHERE ride_id IS NOT NULL GROUP BY ride_id HAVING COUNT(*) > 1)";
      const wantRepeated =
        (cond.operator === "equals" && cond.values.includes("Yes") && !cond.values.includes("No")) ||
        (cond.operator === "not_equals" && cond.values.includes("No") && !cond.values.includes("Yes"));
      const wantNotRepeated =
        (cond.operator === "equals" && cond.values.includes("No") && !cond.values.includes("Yes")) ||
        (cond.operator === "not_equals" && cond.values.includes("Yes") && !cond.values.includes("No"));
      if (wantRepeated) return `ride_id IN ${sub}`;
      if (wantNotRepeated) return `(ride_id IS NULL OR ride_id NOT IN ${sub})`;
      return null;
    },
  },
];

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f]),
);

export const DETAIL_FIELD_KEYS: Set<string> = new Set(
  FIELD_DEFS.filter((f) => f.requiresDetail).map((f) => f.key),
);

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "=",
  not_equals: "≠",
  contains: "Contains",
  not_contains: "Does not contain",
  starts_with: "Starts with",
  ends_with: "Ends with",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  before: "Before",
  after: "After",
  last_n_days: "Last N days",
  between: "Between",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};
