import { useState, useEffect, useRef, useCallback } from "react";
import type { FilterCondition, FilterOperator } from "../types";
import { FIELD_MAP, OPERATOR_LABELS } from "../lib/fields";
import { getDistinctValues } from "../lib/database";
import { useWorkoutStore } from "../stores/workoutStore";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Returns true if the condition has a meaningful value to filter on. */
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

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

function OperatorSelect({
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

function NumberInput({
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

function TextInput({
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

function DateInput({
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

function EnumMultiSelect({
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

function valueSummary(condition: FilterCondition): string {
  const field = FIELD_MAP[condition.field];
  if (condition.operator === "is_empty") return "empty";
  if (condition.operator === "is_not_empty") return "not empty";
  if (field?.type === "enum" && condition.values.length > 0) {
    if (condition.values.length === 1) return condition.values[0];
    return `${condition.values.length} selected`;
  }
  return condition.value || "...";
}

const isUnaryOp = (op: FilterOperator) =>
  op === "is_empty" || op === "is_not_empty";

export default function FilterChip({
  condition,
  defaultOpen = false,
}: {
  condition: FilterCondition;
  defaultOpen?: boolean;
}) {
  const { updateCondition, removeCondition } = useWorkoutStore();
  const [open, setOpen] = useState(defaultOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close);

  const field = FIELD_MAP[condition.field];
  if (!field) return null;

  const active = isConditionActive(condition);
  const opLabel = OPERATOR_LABELS[condition.operator];
  const summary = valueSummary(condition);

  const chipClasses = active
    ? "inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-sm text-blue-700 shadow-sm hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
    : "inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-sm text-gray-500 shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className={chipClasses}
      >
        <span className={active ? "text-blue-400" : "text-gray-400"}>≡</span>
        <span className="font-medium">{field.label}:</span>
        <span className={active ? "text-blue-600" : "text-gray-400"}>
          {opLabel} {summary}
        </span>
        <svg className={`h-3 w-3 ${active ? "text-blue-400" : "text-gray-400"}`} viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">{field.label}</div>

            <OperatorSelect
              operators={field.operators}
              value={condition.operator}
              onChange={(op) => updateCondition(condition.id, { operator: op })}
            />

            {!isUnaryOp(condition.operator) && field.type === "number" && (
              <NumberInput
                value={condition.value}
                onChange={(v) => updateCondition(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "string" && (
              <TextInput
                value={condition.value}
                onChange={(v) => updateCondition(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "date" && (
              <DateInput
                value={condition.value}
                onChange={(v) => updateCondition(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "enum" && (
              <EnumMultiSelect
                fieldKey={condition.field}
                selectedValues={condition.values}
                onChange={(values) =>
                  updateCondition(condition.id, { values })
                }
              />
            )}

            <button
              onClick={() => removeCondition(condition.id)}
              className="w-full rounded border border-red-200 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
