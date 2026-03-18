import { useMemo } from "react";
import type { Workout } from "../types";

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

interface ParsedRawJson {
  instructorImageUrl: string | null;
  classAirDate: number | null;
}

const parsedCache = new Map<string, ParsedRawJson>();

function parseRawJson(workoutId: string, rawJson: string | null): ParsedRawJson {
  const cached = parsedCache.get(workoutId);
  if (cached) return cached;

  const empty: ParsedRawJson = { instructorImageUrl: null, classAirDate: null };
  if (!rawJson) {
    parsedCache.set(workoutId, empty);
    return empty;
  }

  try {
    const parsed = JSON.parse(rawJson);
    const rawUrl: string | null = parsed.ride?.instructor?.image_url ?? null;
    const result: ParsedRawJson = {
      instructorImageUrl: rawUrl
        ? `https://res.cloudinary.com/peloton-uat/image/fetch/c_fill,dpr_2.0,f_auto,q_auto:good,w_100/${rawUrl}`
        : null,
      classAirDate: parsed.ride?.original_air_time ?? null,
    };
    parsedCache.set(workoutId, result);
    return result;
  } catch {
    parsedCache.set(workoutId, empty);
    return empty;
  }
}

function formatWorkoutDate(ts: number): string {
  const d = new Date(ts * 1000);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const year = String(d.getFullYear()).slice(2);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${day} ${month}/${date}/${year} @ ${h}:${mm} ${ampm}`;
}

function formatClassDate(ts: number): string {
  const d = new Date(ts * 1000);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const year = String(d.getFullYear()).slice(2);
  return `Class: ${day} ${month}/${date}/${year}`;
}

interface MetricOverride {
  value: string;
  unit: string;
}

interface WorkoutCardProps {
  workout: Workout;
  isSelected: boolean;
  onClick: () => void;
  sortField?: string;
  label?: string;
  metricOverride?: MetricOverride;
}

export default function WorkoutCard({ workout, isSelected, onClick, sortField, label, metricOverride }: WorkoutCardProps) {
  const { instructorImageUrl, classAirDate } = useMemo(
    () => parseRawJson(workout.id, workout.raw_json),
    [workout.id, workout.raw_json],
  );

  const metric = (sortField && METRIC_DISPLAYS[sortField]) || DEFAULT_METRIC;
  const raw = workout[metric.field] as number | null;
  const hasMetric = metricOverride || (raw != null && raw > 0);
  const metricValue = metricOverride?.value ?? (raw != null && raw > 0 ? metric.format(raw) : null);
  const metricUnit = metricOverride?.unit ?? metric.unit;

  const instructorDisplay = workout.instructor ?? null;
  const subtitle = instructorDisplay
    ? `${instructorDisplay.toUpperCase()} \u00b7 ${workout.discipline.toUpperCase()}`
    : workout.discipline.toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col text-left transition-colors ${
        isSelected
          ? "bg-gray-800 text-white"
          : "hover:bg-gray-50"
      }`}
    >
      {label && (
        <div className={`px-4 pt-2 text-sm font-medium ${
          isSelected ? "text-gray-400" : "text-gray-700"
        }`}>
          {label}
        </div>
      )}

      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        {/* Avatar */}
        <div className="shrink-0">
          {instructorImageUrl ? (
            <img
              src={instructorImageUrl}
              alt={instructorDisplay ?? "Instructor"}
              className="h-10 w-10 rounded-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                target.nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white bg-gray-400 ${
              instructorImageUrl ? "hidden" : ""
            }`}
          >
            {instructorDisplay ? instructorDisplay.charAt(0).toUpperCase() : "?"}
          </div>
        </div>

        {/* Title + subtitle + class date */}
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{workout.title}</div>
          <div className={`truncate text-xs ${isSelected ? "text-gray-400" : "text-gray-500"}`}>
            {subtitle}
          </div>
          {classAirDate && (
            <div className={`text-xs mt-0.5 ${isSelected ? "text-gray-400" : "text-gray-500"}`}>
              {formatClassDate(classAirDate)}
            </div>
          )}
        </div>

        {/* Metric */}
        {hasMetric && metricValue && (
          <div className="shrink-0 text-right pl-2">
            <span className="text-xl font-bold leading-tight">{metricValue}</span>
            <div className={`text-xs ${isSelected ? "text-gray-400" : "text-gray-500"}`}>
              {metricUnit}
            </div>
          </div>
        )}
      </div>

      {/* Footer: workout date */}
      <div className={`px-4 pb-2 text-xs border-t ${
        isSelected ? "border-gray-700 text-gray-400" : "border-gray-100 text-gray-500"
      }`}>
        <span className="pt-1.5 inline-block">{formatWorkoutDate(workout.date)}</span>
      </div>
    </button>
  );
}
