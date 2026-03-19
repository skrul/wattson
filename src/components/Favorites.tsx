import { useEffect, useState, useCallback } from "react";
import { queryWorkouts } from "../lib/database";
import { useNavigationStore } from "../stores/navigationStore";
import type { ChartDefinition, FilterCondition, Workout } from "../types";
import ChartPlot from "./ChartPlot";

let condId = 0;
function mkCondition(field: string, values: string[]): FilterCondition {
  return { id: `fav-${condId++}`, field, operator: "equals", value: "", values };
}

const INSTRUCTOR_CHART: ChartDefinition = {
  id: "fav-instructors",
  name: "",
  mark_type: "bar",
  x_axis_mode: "category",
  x_axis_field: "instructor",
  x_axis_sequential: false,
  agg_function: "count",
  transposed: false,
  min_value: null,
  y_fields: [{ field: "avg_output", side: "left" }],
  group_by: null,
  filters: [],
  created_at: 0,
  updated_at: 0,
};

const CLASS_TYPE_CHART: ChartDefinition = {
  id: "fav-class-types",
  name: "",
  mark_type: "bar",
  x_axis_mode: "category",
  x_axis_field: "class_type",
  x_axis_sequential: false,
  agg_function: "count",
  transposed: false,
  min_value: null,
  y_fields: [{ field: "avg_output", side: "left" }],
  group_by: null,
  filters: [],
  created_at: 0,
  updated_at: 0,
};

export default function Favorites({ refreshKey }: { refreshKey: number }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);

  useEffect(() => {
    let cancelled = false;
    queryWorkouts({ conditions: [], sort: { field: "date", direction: "asc" }, search: "" }).then((rows) => {
      if (!cancelled) {
        setWorkouts(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const onInstructorClick = useCallback((label: string) => {
    navigateToFilteredWorkouts({
      workoutId: "",
      conditions: [mkCondition("instructor", [label])],
      sort: { field: "date", direction: "desc" },
    });
  }, [navigateToFilteredWorkouts]);

  const onClassTypeClick = useCallback((label: string) => {
    navigateToFilteredWorkouts({
      workoutId: "",
      conditions: [mkCondition("class_type", [label])],
      sort: { field: "date", direction: "desc" },
    });
  }, [navigateToFilteredWorkouts]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading favorites...</p>;
  }

  if (workouts.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Favorites</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Top Instructors</h3>
          <ChartPlot chart={INSTRUCTOR_CHART} workouts={workouts} height={250} onCategoryClick={onInstructorClick} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Top Class Types</h3>
          <ChartPlot chart={CLASS_TYPE_CHART} workouts={workouts} height={250} onCategoryClick={onClassTypeClick} />
        </div>
      </div>
    </section>
  );
}
