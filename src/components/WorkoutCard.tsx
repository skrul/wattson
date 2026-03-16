import type { Workout } from "../types";

const DAY_ABBREVS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface MetricDisplay {
  field: keyof Workout;
  format: (v: number) => string;
  unit: string;
}

const METRIC_DISPLAYS: Record<string, MetricDisplay> = {
  total_work:     { field: "total_work",     format: (v) => String(Math.round(v / 1000)), unit: "kj" },
  calories:       { field: "calories",       format: (v) => String(Math.round(v)),        unit: "cal" },
  avg_output:     { field: "avg_output",     format: (v) => String(Math.round(v)),        unit: "W" },
  distance:       { field: "distance",       format: (v) => v.toFixed(2),                 unit: "mi" },
  avg_heart_rate: { field: "avg_heart_rate", format: (v) => String(Math.round(v)),        unit: "bpm" },
  avg_cadence:    { field: "avg_cadence",    format: (v) => String(Math.round(v)),        unit: "rpm" },
  avg_speed:      { field: "avg_speed",      format: (v) => v.toFixed(1),                 unit: "mph" },
  strive_score:   { field: "strive_score",   format: (v) => v.toFixed(1),                 unit: "pts" },
};

const DEFAULT_METRIC = METRIC_DISPLAYS.total_work;

interface WorkoutCardProps {
  workout: Workout;
  isSelected: boolean;
  onClick: () => void;
  sortField?: string;
}

export default function WorkoutCard({ workout, isSelected, onClick, sortField }: WorkoutCardProps) {
  const d = new Date(workout.date * 1000);
  const dayAbbrev = DAY_ABBREVS[d.getDay()];
  const dayNum = d.getDate();

  const metric = (sortField && METRIC_DISPLAYS[sortField]) || DEFAULT_METRIC;
  const raw = workout[metric.field] as number | null;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected
          ? "bg-gray-800 text-white"
          : "hover:bg-gray-50"
      }`}
    >
      <div className="flex flex-col items-center w-10 shrink-0">
        <span className={`text-[10px] font-semibold tracking-wide ${isSelected ? "text-gray-400" : "text-gray-400"}`}>
          {dayAbbrev}
        </span>
        <span className="text-lg font-bold leading-tight">{dayNum}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{workout.title}</div>
        <div className={`truncate text-xs ${isSelected ? "text-gray-400" : "text-gray-500"}`}>
          {workout.instructor ?? "Unknown"} · {workout.discipline.toUpperCase()}
        </div>
      </div>

      {raw != null && raw > 0 && (
        <div className="shrink-0 text-right">
          <span className="text-sm font-semibold">{metric.format(raw)}</span>
          <span className={`ml-0.5 text-xs ${isSelected ? "text-gray-400" : "text-gray-500"}`}>{metric.unit}</span>
        </div>
      )}
    </button>
  );
}
