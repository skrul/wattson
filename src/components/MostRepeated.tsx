import { useEffect, useState } from "react";
import {
  getDisciplineCounts,
  getMostRepeatedRideWorkoutsByDiscipline,
  type RepeatedRideWorkout,
} from "../lib/database";
import { useNavigationStore } from "../stores/navigationStore";
import WorkoutCard from "./WorkoutCard";

interface DisciplineGroup {
  discipline: string;
  rides: RepeatedRideWorkout[];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MostRepeated({ refreshKey }: { refreshKey: number }) {
  const [groups, setGroups] = useState<DisciplineGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const navigateToWorkout = useNavigationStore((s) => s.navigateToWorkout);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const disciplines = await getDisciplineCounts();
      const results: DisciplineGroup[] = [];

      for (const dc of disciplines) {
        if (!dc.discipline) continue;
        const rides = await getMostRepeatedRideWorkoutsByDiscipline(dc.discipline, 5);
        if (rides.length > 0) {
          results.push({ discipline: dc.discipline, rides });
        }
      }

      if (!cancelled) {
        setGroups(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading most repeated classes...</p>;
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Repeated Classes</h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.discipline}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{capitalize(group.discipline)}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.rides.map((ride) => (
                <div key={ride.ride_id} className="rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors overflow-hidden">
                  <WorkoutCard
                    workout={ride}
                    isSelected={false}
                    onClick={() => navigateToWorkout(ride.id)}
                    metricOverride={{ value: String(ride.repeat_count), unit: "times" }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
