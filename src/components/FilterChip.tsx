import { useState, useEffect, useRef, useCallback } from "react";
import type { FilterCondition } from "../types";
import { FIELD_MAP, OPERATOR_LABELS } from "../lib/fields";
import { useWorkoutStore } from "../stores/workoutStore";
import {
  isConditionActive,
  valueSummary,
  isUnaryOp,
  OperatorSelect,
  NumberInput,
  TextInput,
  DateInput,
  DateRangeInput,
  EnumMultiSelect,
} from "./FilterEditors";

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

            {!isUnaryOp(condition.operator) && field.type === "date" && (condition.operator === "last_n_days" || condition.operator === "between") && (
              <DateRangeInput
                operator={condition.operator}
                value={condition.value}
                values={condition.values}
                onChangeValue={(v) => updateCondition(condition.id, { value: v })}
                onChangeValues={(values) => updateCondition(condition.id, { values })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "date" && condition.operator !== "last_n_days" && condition.operator !== "between" && (
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
