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
  const field = FIELD_MAP[condition.field];
  if (field?.type === "enum") {
    return condition.values.length > 0;
  }
  return condition.value !== "";
}

export function valueSummary(condition: FilterCondition): string {
  const field = FIELD_MAP[condition.field];
  if (condition.operator === "is_empty") return "empty";
  if (condition.operator === "is_not_empty") return "not empty";
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
