import { useState, useEffect } from "react";
import type { DashboardWidget, Workout } from "../../types";
import { getRecentFilteredWorkouts } from "../../lib/database";
import { useNavigationStore } from "../../stores/navigationStore";
import { useWorkoutStore } from "../../stores/workoutStore";
import WorkoutCard from "../WorkoutCard";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function WorkoutListWidget({ widget }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const navigateToWorkout = useNavigationStore((s) => s.navigateToWorkout);
  const syncGeneration = useWorkoutStore((s) => s.syncGeneration);

  if (widget.config.type !== "workout_list") return null;
  const { limit, filters, title } = widget.config;

  useEffect(() => {
    setLoading(true);
    getRecentFilteredWorkouts(limit, filters)
      .then((r) => setWorkouts(r))
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false));
  }, [limit, JSON.stringify(filters), syncGeneration]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 text-sm font-medium text-gray-700 truncate">
        {title || "Recent Workouts"}
      </div>

      {workouts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-gray-400">No workouts found</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {workouts.map((workout) => (
            <div key={workout.id} className="rounded-lg border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
              <WorkoutCard
                workout={workout}
                isSelected={false}
                onClick={() => navigateToWorkout(workout.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
