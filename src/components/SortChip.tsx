import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { FIELD_DEFS, FIELD_MAP } from "../lib/fields";
import { useWorkoutStore } from "../stores/workoutStore";
import { useEnrichmentStore } from "../stores/enrichmentStore";

export default function SortChip() {
  const { filters, setSort, clearSort } = useWorkoutStore();
  const sort = filters.sort;
  const field = FIELD_MAP[sort.field];
  const arrow = sort.direction === "asc" ? "↑" : "↓";
  const enrichmentComplete = useEnrichmentStore((s) => s.enrichmentComplete);
  const sortableFields = FIELD_DEFS.filter((f) => f.sortable);

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span>{arrow}</span>
            <span className="font-medium">{field?.label ?? sort.field}</span>
            <svg className="h-3 w-3 text-gray-400" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 5l3 3 3-3" />
            </svg>
          </PopoverButton>

          <PopoverPanel
            anchor="bottom start"
            className="z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          >
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Field
                </label>
                <select
                  value={sort.field}
                  onChange={(e) =>
                    setSort({ ...sort, field: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {sortableFields.map((f) => {
                    const disabled = f.requiresDetail && !enrichmentComplete;
                    return (
                      <option key={f.key} value={f.key} disabled={disabled}>
                        {f.label}{disabled ? " (detailed mode)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Direction
                </label>
                <select
                  value={sort.direction}
                  onChange={(e) =>
                    setSort({
                      ...sort,
                      direction: e.target.value as "asc" | "desc",
                    })
                  }
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>

              <button
                onClick={() => {
                  clearSort();
                  close();
                }}
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
              >
                Reset to default
              </button>
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
