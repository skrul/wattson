import { useState, useEffect, useRef } from "react";
import type { FilterCondition, FilterOperator } from "../types";
import { FIELD_MAP, OPERATOR_LABELS } from "../lib/fields";
import { getDistinctValues } from "../lib/database";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function isConditionActive(condition: FilterCondition): boolean {
  if (condition.operator === "is_empty" || condition.operator === "is_not_empty") {
    return true;
  }
  if (condition.operator === "last_n_days") {
    return condition.value !== "" && !isNaN(Number(condition.value));
  }
  if (condition.operator === "between") {
    return condition.values.length === 2 && condition.values[0] !== "" && condition.values[1] !== "";
  }
  const field = FIELD_MAP[condition.field];
  if (field?.type === "enum") {
    return condition.values.length > 0;
  }
  return condition.value !== "";
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function valueSummary(condition: FilterCondition): string {
  const field = FIELD_MAP[condition.field];
  if (condition.operator === "is_empty") return "empty";
  if (condition.operator === "is_not_empty") return "not empty";
  if (condition.operator === "last_n_days") {
    return condition.value ? `last ${condition.value} days` : "...";
  }
  if (condition.operator === "between") {
    if (condition.values.length === 2 && condition.values[0] && condition.values[1]) {
      return `${formatShortDate(condition.values[0])} \u2013 ${formatShortDate(condition.values[1])}`;
    }
    return "...";
  }
  if (field?.type === "enum" && condition.values.length > 0) {
    if (condition.values.length === 1) return condition.values[0];
    return `${condition.values.length} selected`;
  }
  return condition.value || "...";
}

export const isUnaryOp = (op: FilterOperator) =>
  op === "is_empty" || op === "is_not_empty";

export function OperatorSelect({
  operators,
  value,
  onChange,
}: {
  operators: FilterOperator[];
  value: FilterOperator;
  onChange: (op: FilterOperator) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FilterOperator)}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
    >
      {operators.map((op) => (
        <option key={op} value={op}>
          {OPERATOR_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, 300);
  const prevDebounced = useRef(debounced);

  useEffect(() => {
    if (debounced !== prevDebounced.current) {
      prevDebounced.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      placeholder="Value..."
      autoFocus
    />
  );
}

export function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, 300);
  const prevDebounced = useRef(debounced);

  useEffect(() => {
    if (debounced !== prevDebounced.current) {
      prevDebounced.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      placeholder="Value..."
      autoFocus
    />
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      autoFocus
    />
  );
}

const DAY_PRESETS = [7, 30, 60, 90, 365];

export function DateRangeInput({
  operator,
  value,
  values,
  onChangeValue,
  onChangeValues,
}: {
  operator: "last_n_days" | "between";
  value: string;
  values: string[];
  onChangeValue: (v: string) => void;
  onChangeValues: (v: string[]) => void;
}) {
  if (operator === "last_n_days") {
    return (
      <div className="space-y-2">
        <input
          type="number"
          min="1"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Number of days..."
          autoFocus
        />
        <div className="flex flex-wrap gap-1">
          {DAY_PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => onChangeValue(String(n))}
              className={`rounded px-2 py-0.5 text-xs ${
                value === String(n)
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>
    );
  }

  const start = values[0] ?? "";
  const end = values[1] ?? "";

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500">Start</label>
        <input
          type="date"
          value={start}
          onChange={(e) => onChangeValues([e.target.value, end])}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">End</label>
        <input
          type="date"
          value={end}
          onChange={(e) => onChangeValues([start, e.target.value])}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

export function EnumMultiSelect({
  fieldKey,
  selectedValues,
  onChange,
}: {
  fieldKey: string;
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    getDistinctValues(fieldKey).then(setOptions).catch(() => setOptions([]));
  }, [fieldKey]);

  const toggle = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  return (
    <div>
      {selectedValues.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedValues.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
            >
              {v}
              <button
                onClick={() => toggle(v)}
                className="ml-0.5 text-blue-600 hover:text-blue-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-48 overflow-y-auto">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={selectedValues.includes(opt)}
              onChange={() => toggle(opt)}
              className="rounded border-gray-300"
            />
            <span className="capitalize">{opt}</span>
          </label>
        ))}
        {options.length === 0 && (
          <p className="px-2 py-1 text-xs text-gray-400">No values found</p>
        )}
      </div>
    </div>
  );
}
