import { useState, useEffect } from "react";
import type { DashboardWidget, Workout } from "../../types";
import { getTopFilteredWorkout } from "../../lib/database";
import { PERSONAL_RECORD_METRICS } from "../../lib/dashboardDefaults";
import { useNavigationStore } from "../../stores/navigationStore";
import WorkoutCard from "../WorkoutCard";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function PersonalRecordWidget({ widget }: Props) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);

  if (widget.config.type !== "personal_record") return null;
  const { metric, filters, title } = widget.config;

  const metricDef = PERSONAL_RECORD_METRICS.find((m) => m.key === metric);

  useEffect(() => {
    setLoading(true);
    getTopFilteredWorkout(metric, filters)
      .then((w) => setWorkout(w))
      .catch(() => setWorkout(null))
      .finally(() => setLoading(false));
  }, [metric, JSON.stringify(filters)]);

  const handleClick = () => {
    navigateToFilteredWorkouts({
      workoutId: workout?.id ?? "",
      conditions: filters,
      sort: { field: metric, direction: "desc" },
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <span className="text-sm text-gray-400">No data</span>
        <span className="mt-1 text-xs text-gray-400">{title || metricDef?.label || metric}</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <WorkoutCard
        workout={workout}
        isSelected={false}
        onClick={handleClick}
        sortField={metric}
        label={title || metricDef?.label || metric}
      />
    </div>
  );
}
