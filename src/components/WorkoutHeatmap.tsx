import { useCallback, useEffect, useRef, useState } from "react";
import { getDailyWorkoutCounts } from "../lib/database";
import { renderWorkoutHeatmap } from "../lib/charts";
import { useNavigationStore } from "../stores/navigationStore";
import type { DailyWorkoutCount } from "../lib/database";
import type { FilterCondition } from "../types";

export default function WorkoutHeatmap({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DailyWorkoutCount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);

  const handleDayClick = useCallback((date: string) => {
    const condition: FilterCondition = {
      id: `heatmap-${Date.now()}`,
      field: "date",
      operator: "between",
      value: "",
      values: [date, date],
    };
    navigateToFilteredWorkouts({
      workoutId: "",
      conditions: [condition],
      sort: { field: "date", direction: "desc" },
    });
  }, [navigateToFilteredWorkouts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts = await getDailyWorkoutCounts(365);
      if (!cancelled) {
        setData(counts);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;

    const w = el.clientWidth || 800;
    const svg = renderWorkoutHeatmap(data, w, 160, handleDayClick);
    el.replaceChildren(svg);
  }, [data, handleDayClick]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading heatmap...</p>;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div ref={containerRef} className="w-full overflow-x-auto" />
      </div>
    </section>
  );
}
