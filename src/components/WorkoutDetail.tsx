import type { Workout } from "../types";

interface WorkoutDetailProps {
  workout: Workout | null;
}

function formatDetailDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDetailTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface StatProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}

function Stat({ label, value, unit }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold">{value ?? "—"}</span>
      <span className="text-xs text-gray-500">
        {label}{unit ? ` (${unit})` : ""}
      </span>
    </div>
  );
}

/** Detail view for a single workout with stats. */
export default function WorkoutDetail({ workout }: WorkoutDetailProps) {
  if (!workout) {
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-4 text-lg font-semibold">Workout Detail</h2>
        <p className="text-gray-500">Select a workout to view detailed metrics</p>
      </div>
    );
  }

  const discipline = workout.discipline.charAt(0).toUpperCase() + workout.discipline.slice(1);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          {formatDetailDate(workout.date)} at {formatDetailTime(workout.date)}
        </p>
        <h2 className="mt-1 text-xl font-bold">{discipline} Workout</h2>
        <p className="mt-1 text-sm text-gray-600">
          {workout.title}
          {workout.instructor && <> · {workout.instructor}</>}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Duration: {formatDuration(workout.duration_seconds)}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-6">
        <Stat label="Total Output" value={workout.total_output != null ? Math.round(workout.total_output / 1000) : null} unit="kj" />
        <Stat label="Distance" value={workout.distance != null ? workout.distance.toFixed(2) : null} unit="mi" />
        <Stat label="Calories" value={workout.calories} unit="kcal" />

        <Stat label="Avg Output" value={workout.output_watts} unit="watts" />
        <Stat label="Avg Cadence" value={workout.avg_cadence} unit="rpm" />
        <Stat label="Avg Resistance" value={workout.avg_resistance != null ? `${workout.avg_resistance}%` : null} />

        <Stat label="Avg Speed" value={workout.avg_speed != null ? workout.avg_speed.toFixed(1) : null} unit="mph" />
        <Stat label="Avg Heart Rate" value={workout.avg_heart_rate} unit="bpm" />
        <Stat label="Strive Score" value={workout.strive_score != null ? workout.strive_score.toFixed(1) : null} />
      </div>
    </div>
  );
}
