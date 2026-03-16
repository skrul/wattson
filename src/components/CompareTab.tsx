import type { Workout } from "../types";

interface CompareTabProps {
  workouts: Workout[];
  currentId: string;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MetricCell({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold">{value ?? "—"}</span>
      <span className="text-xs text-gray-500">{label}{unit ? ` (${unit})` : ""}</span>
    </div>
  );
}

export default function CompareTab({ workouts, currentId }: CompareTabProps) {
  const sorted = [...workouts].sort((a, b) => b.date - a.date);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((w) => {
        const isCurrent = w.id === currentId;
        return (
          <div
            key={w.id}
            className={`rounded-lg border p-4 ${
              isCurrent
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">{formatDate(w.date)}</span>
              {isCurrent && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  Current
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-4">
              <MetricCell label="Output" value={w.total_work != null ? Math.round(w.total_work / 1000) : null} unit="kj" />
              <MetricCell label="Calories" value={w.calories} unit="kcal" />
              <MetricCell label="Distance" value={w.distance != null ? w.distance.toFixed(2) : null} unit="mi" />
              <MetricCell label="Avg HR" value={w.avg_heart_rate} unit="bpm" />
              <MetricCell label="Strive" value={w.strive_score != null ? w.strive_score.toFixed(1) : null} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
