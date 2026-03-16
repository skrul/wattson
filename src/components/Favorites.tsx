import { useEffect, useState } from "react";
import {
  getTopInstructors,
  getTopClassTypes,
  getMostRepeatedRides,
  type InstructorCount,
  type ClassTypeCount,
  type RepeatedRide,
} from "../lib/database";
import { useNavigationStore } from "../stores/navigationStore";
import type { FilterCondition } from "../types";

let condId = 0;
function mkCondition(field: string, values: string[]): FilterCondition {
  return { id: `fav-${condId++}`, field, operator: "equals", value: "", values };
}

export default function Favorites({ refreshKey }: { refreshKey: number }) {
  const [instructors, setInstructors] = useState<InstructorCount[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeCount[]>([]);
  const [rides, setRides] = useState<RepeatedRide[]>([]);
  const [loading, setLoading] = useState(true);
  const navigateToWorkout = useNavigationStore((s) => s.navigateToWorkout);
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getTopInstructors(5),
      getTopClassTypes(5),
      getMostRepeatedRides(5),
    ]).then(([ins, cts, rds]) => {
      if (!cancelled) {
        setInstructors(ins);
        setClassTypes(cts);
        setRides(rds);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading favorites...</p>;
  }

  const hasData = instructors.length > 0 || classTypes.length > 0 || rides.length > 0;
  if (!hasData) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Favorites</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {instructors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Top Instructors</h3>
            <ul className="space-y-1">
              {instructors.map((ins) => (
                <li key={ins.instructor} className="flex justify-between text-sm">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => navigateToFilteredWorkouts({
                      workoutId: "",
                      conditions: [mkCondition("instructor", [ins.instructor])],
                      sort: { field: "date", direction: "desc" },
                    })}
                  >
                    {ins.instructor}
                  </button>
                  <span className="text-gray-400">{ins.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {classTypes.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Top Class Types</h3>
            <ul className="space-y-1">
              {classTypes.map((ct) => (
                <li key={ct.class_type} className="flex justify-between text-sm">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => navigateToFilteredWorkouts({
                      workoutId: "",
                      conditions: [mkCondition("class_type", [ct.class_type])],
                      sort: { field: "date", direction: "desc" },
                    })}
                  >
                    {ct.class_type}
                  </button>
                  <span className="text-gray-400">{ct.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rides.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Most Repeated Rides</h3>
            <ul className="space-y-2">
              {rides.map((ride) => (
                <li key={ride.ride_id} className="text-sm">
                  <button
                    className="text-left hover:text-blue-600 transition-colors"
                    onClick={() => navigateToWorkout(ride.workout_id)}
                  >
                    <span className="text-gray-900">{ride.title}</span>
                    {ride.instructor && (
                      <span className="text-gray-400 ml-1">({ride.instructor})</span>
                    )}
                    <span className="text-gray-400 ml-1">&middot; {ride.count} times</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
