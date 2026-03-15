import type { Workout } from "../types";

const DAY_ABBREVS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface WorkoutCardProps {
  workout: Workout;
  isSelected: boolean;
  onClick: () => void;
}

export default function WorkoutCard({ workout, isSelected, onClick }: WorkoutCardProps) {
  const d = new Date(workout.date * 1000);
  const dayAbbrev = DAY_ABBREVS[d.getDay()];
  const dayNum = d.getDate();

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

      {workout.total_output != null && workout.total_output > 0 && (
        <div className="shrink-0 text-right">
          <span className="text-sm font-semibold">{Math.round(workout.total_output / 1000)}</span>
          <span className={`ml-0.5 text-xs ${isSelected ? "text-gray-400" : "text-gray-500"}`}>kj</span>
        </div>
      )}
    </button>
  );
}
