import { useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { FIELD_DEFS } from "../lib/fields";
import { useWorkoutStore } from "../stores/workoutStore";
import type { FilterCondition } from "../types";

export default function AddFilterButton({
  onFilterCreated,
}: {
  onFilterCreated: (id: string) => void;
}) {
  const { addCondition } = useWorkoutStore();
  const [search, setSearch] = useState("");

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
    addCondition(condition);
    onFilterCreated(condition.id);
    setSearch("");
    close();
  };

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
              {filtered.map((f) => (
                <button
                  key={f.key}
                  onClick={() => handleSelect(f.key, close)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="w-4 text-xs text-gray-400">
                    {f.type === "number"
                      ? "#"
                      : f.type === "enum"
                        ? "⊙"
                        : f.type === "date"
                          ? "◷"
                          : "T"}
                  </span>
                  {f.label}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No matching fields</p>
              )}
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
