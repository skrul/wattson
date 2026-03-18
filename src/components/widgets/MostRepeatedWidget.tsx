import { useState, useEffect } from "react";
import type { DashboardWidget } from "../../types";
import { getMostRepeatedFilteredWorkouts, type RepeatedRideWorkout } from "../../lib/database";
import { useNavigationStore } from "../../stores/navigationStore";
import WorkoutCard from "../WorkoutCard";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function MostRepeatedWidget({ widget }: Props) {
  const [rides, setRides] = useState<RepeatedRideWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const navigateToWorkout = useNavigationStore((s) => s.navigateToWorkout);

  if (widget.config.type !== "most_repeated") return null;
  const { limit, filters, title } = widget.config;

  useEffect(() => {
    setLoading(true);
    getMostRepeatedFilteredWorkouts(limit, filters)
      .then((r) => setRides(r))
      .catch(() => setRides([]))
      .finally(() => setLoading(false));
  }, [limit, JSON.stringify(filters)]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 text-xs font-medium text-gray-500 truncate">
        {title || "Most Repeated"}
      </div>

      {rides.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-gray-400">No repeated rides</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {rides.map((ride) => (
            <div key={ride.id} className="rounded-lg border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
              <WorkoutCard
                workout={ride}
                isSelected={false}
                onClick={() => navigateToWorkout(ride.id)}
                metricOverride={{ value: String(ride.repeat_count), unit: "times" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
