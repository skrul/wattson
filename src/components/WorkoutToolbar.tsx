import { useState, useCallback, useRef, useEffect } from "react";
import { useWorkoutStore } from "../stores/workoutStore";
import SortChip from "./SortChip";
import FilterChip from "./FilterChip";
import AddFilterButton from "./AddFilterButton";

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SearchInput() {
  const { filters, setSearch } = useWorkoutStore();
  const [open, setOpen] = useState(filters.search !== "");
  const [local, setLocal] = useState(filters.search);
  const debounced = useDebounce(local, 300);
  const prevDebounced = useRef(debounced);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounced !== prevDebounced.current) {
      prevDebounced.current = debounced;
      setSearch(debounced);
    }
  }, [debounced, setSearch]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleClose = () => {
    setLocal("");
    setSearch("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Search"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search..."
        className="w-40 border-none bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
      />
      <button
        onClick={handleClose}
        className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        title="Clear search"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface WorkoutToolbarProps {
  viewMode?: "table" | "detail";
  onViewModeChange?: (mode: "table" | "detail") => void;
}

export default function WorkoutToolbar({ viewMode = "table", onViewModeChange }: WorkoutToolbarProps) {
  const { filters } = useWorkoutStore();
  const [newFilterId, setNewFilterId] = useState<string | null>(null);

  const handleFilterCreated = useCallback((id: string) => {
    setNewFilterId(id);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <SortChip />

      {filters.conditions.length > 0 && (
        <div className="h-4 w-px bg-gray-300" />
      )}

      {filters.conditions.map((cond) => (
        <FilterChip
          key={cond.id}
          condition={cond}
          defaultOpen={cond.id === newFilterId}
        />
      ))}

      <AddFilterButton onFilterCreated={handleFilterCreated} />

      <div className="ml-auto flex items-center gap-1">
        {onViewModeChange && (
          <>
            {/* Table view */}
            <button
              onClick={() => onViewModeChange("table")}
              className={`rounded p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                viewMode === "table" ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
              title="Table view"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
              </svg>
            </button>
            {/* Detail view */}
            <button
              onClick={() => onViewModeChange("detail")}
              className={`rounded p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                viewMode === "detail" ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
              title="Detail view"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
              </svg>
            </button>
          </>
        )}
        <SearchInput />
      </div>
    </div>
  );
}
