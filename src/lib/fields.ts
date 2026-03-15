import type { FieldType, FilterOperator } from "../types";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  operators: FilterOperator[];
  filterable: boolean;
  sortable: boolean;
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
  "equals", "before", "after", "is_empty", "is_not_empty",
];

export const FIELD_DEFS: FieldDef[] = [
  { key: "date", label: "Date", type: "date", operators: DATE_OPS, filterable: true, sortable: true },
  { key: "title", label: "Title", type: "string", operators: STRING_OPS, filterable: true, sortable: true },
  { key: "instructor", label: "Instructor", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "discipline", label: "Discipline", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "duration_seconds", label: "Duration", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "output_watts", label: "Output (watts)", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "calories", label: "Calories", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "distance", label: "Distance", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "avg_heart_rate", label: "Avg Heart Rate", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "avg_cadence", label: "Avg Cadence", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "avg_resistance", label: "Avg Resistance", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "avg_speed", label: "Avg Speed", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "strive_score", label: "Strive Score", type: "number", operators: NUMBER_OPS, filterable: true, sortable: true },
  { key: "workout_type", label: "Workout Type", type: "enum", operators: ENUM_OPS, filterable: true, sortable: true },
  { key: "is_live", label: "Live/On-Demand", type: "enum", operators: ENUM_OPS, filterable: true, sortable: false },
];

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f]),
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
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};
