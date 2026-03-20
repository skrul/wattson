import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { FIELD_DEFS, FIELD_MAP, OPERATOR_LABELS } from "../lib/fields";
import { useEnrichmentStore } from "../stores/enrichmentStore";
import type { FilterCondition } from "../types";
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

function FilterChip({
  condition,
  defaultOpen = false,
  onUpdate,
  onRemove,
  allConditions,
}: {
  condition: FilterCondition;
  defaultOpen?: boolean;
  onUpdate: (id: string, updates: Partial<FilterCondition>) => void;
  onRemove: (id: string) => void;
  allConditions: FilterCondition[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const chipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the floating panel relative to the chip
  useEffect(() => {
    if (!open || !chipRef.current) return;
    function update() {
      if (!chipRef.current) return;
      const rect = chipRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Close on click outside (union of chip + portal panel).
  // Use pointerdown in capture phase so it fires before Headless UI can stop propagation.
  useEffect(() => {
    if (!open) return;
    function handler(e: PointerEvent) {
      const target = e.target as Node;
      if (
        chipRef.current && !chipRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  const field = FIELD_MAP[condition.field];

  const scopeFilter = useMemo(() => {
    if (!field?.scopedBy) return undefined;
    const scopeValues = allConditions
      .filter((c) => c.field === field.scopedBy && c.operator === "equals")
      .flatMap((c) => c.values);
    if (scopeValues.length === 0) return undefined;
    return { column: field.scopedBy, values: scopeValues };
  }, [field?.scopedBy, allConditions]);

  if (!field) return null;

  const active = isConditionActive(condition);
  const opLabel = OPERATOR_LABELS[condition.operator];
  const summary = valueSummary(condition);

  const chipClasses = active
    ? "inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-sm text-blue-700 shadow-sm hover:bg-blue-100"
    : "inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-sm text-gray-500 shadow-sm hover:bg-gray-100";

  return (
    <div className="relative">
      <button ref={chipRef} onClick={() => setOpen(!open)} className={chipClasses}>
        <span className={active ? "text-blue-400" : "text-gray-400"}>≡</span>
        <span className="font-medium">{field.label}:</span>
        <span className={active ? "text-blue-600" : "text-gray-400"}>
          {opLabel} {summary}
        </span>
        <svg className={`h-3 w-3 ${active ? "text-blue-400" : "text-gray-400"}`} viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-[100] w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">{field.label}</div>

            <OperatorSelect
              operators={field.operators}
              value={condition.operator}
              onChange={(op) => onUpdate(condition.id, { operator: op })}
            />

            {!isUnaryOp(condition.operator) && field.type === "number" && (
              <NumberInput
                value={condition.value}
                onChange={(v) => onUpdate(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "string" && (
              <TextInput
                value={condition.value}
                onChange={(v) => onUpdate(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "date" && (condition.operator === "last_n_days" || condition.operator === "between") && (
              <DateRangeInput
                operator={condition.operator}
                value={condition.value}
                values={condition.values}
                onChangeValue={(v) => onUpdate(condition.id, { value: v })}
                onChangeValues={(values) => onUpdate(condition.id, { values })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "date" && condition.operator !== "last_n_days" && condition.operator !== "between" && (
              <DateInput
                value={condition.value}
                onChange={(v) => onUpdate(condition.id, { value: v })}
              />
            )}

            {!isUnaryOp(condition.operator) && field.type === "enum" && (
              <EnumMultiSelect
                fieldKey={condition.field}
                selectedValues={condition.values}
                onChange={(values) => onUpdate(condition.id, { values })}
                scopeFilter={scopeFilter}
              />
            )}

            <button
              onClick={() => onRemove(condition.id)}
              className="w-full rounded border border-red-200 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete filter
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Generic filter bar — accepts filters and callbacks, no store dependency. */
export function FilterBar({
  filters,
  onAdd,
  onUpdate,
  onRemove,
}: {
  filters: FilterCondition[];
  onAdd: (condition: FilterCondition) => void;
  onUpdate: (id: string, updates: Partial<FilterCondition>) => void;
  onRemove: (id: string) => void;
}) {
  const enrichmentComplete = useEnrichmentStore((s) => s.enrichmentComplete);
  const [search, setSearch] = useState("");
  const [newFilterId, setNewFilterId] = useState<string | null>(null);

  const filterableFields = FIELD_DEFS.filter((f) => f.filterable);
  const filtered = search
    ? filterableFields.filter((f) =>
        f.label.toLowerCase().includes(search.toLowerCase()),
      )
    : filterableFields;

  const handleSelect = (fieldKey: string, close: () => void) => {
    const field = FIELD_DEFS.find((f) => f.key === fieldKey);
    if (!field) return;
    const condition: FilterCondition = {
      id: crypto.randomUUID(),
      field: fieldKey,
      operator: field.operators[0],
      value: "",
      values: [],
    };
    onAdd(condition);
    setNewFilterId(condition.id);
    setSearch("");
    close();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500">Filters:</span>
      {filters.map((c) => (
        <FilterChip
          key={c.id}
          condition={c}
          defaultOpen={c.id === newFilterId}
          onUpdate={onUpdate}
          onRemove={onRemove}
          allConditions={filters}
        />
      ))}

      <Popover className="relative">
        {({ close }) => (
          <>
            <PopoverButton className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 1v12M1 7h12" />
              </svg>
              Filter
            </PopoverButton>

            <PopoverPanel
              anchor="bottom start"
              className="z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <div className="border-b border-gray-100 p-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {filtered.map((f) => {
                  const disabled = f.requiresDetail && !enrichmentComplete;
                  return (
                    <button
                      key={f.key}
                      onClick={() => !disabled && handleSelect(f.key, close)}
                      disabled={disabled}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                        disabled
                          ? "cursor-not-allowed text-gray-300"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`w-4 text-xs ${disabled ? "text-gray-300" : "text-gray-400"}`}>
                        {f.type === "number" ? "#" : f.type === "enum" ? "⊙" : f.type === "date" ? "◷" : "T"}
                      </span>
                      {f.label}
                      {disabled && (
                        <span className="ml-auto text-xs text-gray-300">Detailed</span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400">No matching fields</p>
                )}
              </div>
            </PopoverPanel>
          </>
        )}
      </Popover>
    </div>
  );
}

export default FilterBar;
