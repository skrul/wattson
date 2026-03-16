import { useEffect, useState } from "react";
import {
  getDisciplineCounts,
  getDurationCounts,
  getClassTypeCounts,
  getClassSubtypeCounts,
  getTopWorkouts,
  type TopWorkoutFilters,
} from "../lib/database";
import { useNavigationStore } from "../stores/navigationStore";
import type { Workout, FilterCondition } from "../types";

interface CardDef {
  title: string;
  metric: string;
  unit: string;
  filters?: TopWorkoutFilters;
  group: string;
}

interface CardData {
  def: CardDef;
  topWorkout: Workout;
}

function formatMetricValue(workout: Workout, metric: string, unit: string): string {
  const raw = workout[metric as keyof Workout] as number | null;
  if (raw == null) return "—";

  if (unit === "kj") return `${(raw / 1000).toFixed(1)} kJ`;
  if (unit === "cal") return `${Math.round(raw)} cal`;
  if (unit === "pts") return `${raw.toFixed(1)} pts`;
  if (unit === "mi") return `${raw.toFixed(2)} mi`;
  if (unit === "bpm") return `${Math.round(raw)} bpm`;
  if (unit === "rpm") return `${Math.round(raw)} rpm`;
  if (unit === "mph") return `${raw.toFixed(1)} mph`;
  if (unit === "w") return `${Math.round(raw)} W`;
  return String(raw);
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins}-min`;
}

let condId = 0;
function mkCondition(field: string, values: string[]): FilterCondition {
  return { id: `insights-${condId++}`, field, operator: "equals", value: "", values };
}

function RecordCard({ data }: { data: CardData }) {
  const navigateToFilteredWorkouts = useNavigationStore((s) => s.navigateToFilteredWorkouts);
  const { def, topWorkout } = data;

  const handleClick = () => {
    const conditions: FilterCondition[] = [];
    if (def.filters?.discipline) {
      conditions.push(mkCondition("discipline", [def.filters.discipline]));
    }
    if (def.filters?.durationSeconds != null) {
      conditions.push(mkCondition("duration_seconds", [String(def.filters.durationSeconds)]));
    }
    if (def.filters?.classType) {
      conditions.push(mkCondition("class_type", [def.filters.classType]));
    }
    if (def.filters?.classSubtype) {
      conditions.push(mkCondition("class_subtype", [def.filters.classSubtype]));
    }
    navigateToFilteredWorkouts({
      workoutId: topWorkout.id,
      conditions,
      sort: { field: def.metric, direction: "desc" },
    });
  };

  return (
    <button
      className="rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-gray-300 transition-colors w-full"
      onClick={handleClick}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {def.title}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {formatMetricValue(topWorkout, def.metric, def.unit)}
      </p>
      <p className="mt-0.5 text-sm text-gray-500">
        {topWorkout.title} &middot; {formatDate(topWorkout.date)}
      </p>
    </button>
  );
}

export default function PersonalRecords({ refreshKey }: { refreshKey: number }) {
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const defs: CardDef[] = [];

      // Overall bests
      defs.push({ title: "Highest Output", metric: "total_work", unit: "kj", group: "Overall" });
      defs.push({ title: "Most Calories", metric: "calories", unit: "cal", group: "Overall" });
      defs.push({ title: "Best Strive Score", metric: "strive_score", unit: "pts", group: "Overall" });

      // Per-discipline bests (disciplines with >= 5 workouts, non-empty name)
      const disciplines = await getDisciplineCounts();
      for (const dc of disciplines) {
        if (dc.count < 5 || !dc.discipline) continue;
        defs.push({
          title: `Best ${capitalize(dc.discipline)} Output`,
          metric: "total_work",
          unit: "kj",
          filters: { discipline: dc.discipline },
          group: capitalize(dc.discipline),
        });
      }

      // Per-duration cycling (top 3 durations with >= 3 workouts)
      const durations = await getDurationCounts("cycling");
      const topDurations = durations.filter((d) => d.count >= 3).slice(0, 3);
      for (const dur of topDurations) {
        defs.push({
          title: `Best ${formatDuration(dur.duration_seconds)} Output`,
          metric: "total_work",
          unit: "kj",
          filters: { discipline: "cycling", durationSeconds: dur.duration_seconds },
          group: "Cycling by Duration",
        });
      }

      // Per-class-type cycling (top 3 class types with >= 3 workouts)
      const classTypes = await getClassTypeCounts("cycling");
      const topClassTypes = classTypes.filter((ct) => ct.count >= 3).slice(0, 3);
      for (const ct of topClassTypes) {
        defs.push({
          title: `Best ${ct.class_type} Output`,
          metric: "total_work",
          unit: "kj",
          filters: { discipline: "cycling", classType: ct.class_type },
          group: "Cycling by Class Type",
        });
      }

      // Power Zone breakdown by subtype in fixed order
      const PZ_ORDER = ["Power Zone", "Power Zone Endurance", "Power Zone Max", "FTP Test"];
      const PZ_EXCLUDE = new Set(["FTP Warm Up"]);
      const pzCount = classTypes.find((ct) => ct.class_type === "Power Zone");
      if (pzCount && pzCount.count >= 3) {
        const subtypes = await getClassSubtypeCounts("cycling", "Power Zone");
        const subtypeMap = new Map(subtypes.map((st) => [st.class_subtype, st]));
        for (const name of PZ_ORDER) {
          const st = subtypeMap.get(name);
          if (!st || st.count < 3) continue;
          defs.push({
            title: `Best ${name} Output`,
            metric: "total_work",
            unit: "kj",
            filters: { discipline: "cycling", classType: "Power Zone", classSubtype: name },
            group: "Power Zone",
          });
        }
        // Include any remaining subtypes not in the fixed order (except excluded)
        for (const st of subtypes) {
          if (PZ_ORDER.includes(st.class_subtype) || PZ_EXCLUDE.has(st.class_subtype)) continue;
          if (st.count < 3) continue;
          defs.push({
            title: `Best ${st.class_subtype} Output`,
            metric: "total_work",
            unit: "kj",
            filters: { discipline: "cycling", classType: "Power Zone", classSubtype: st.class_subtype },
            group: "Power Zone",
          });
        }
      }

      // Fetch top 1 for each card, skip if top value is 0 or missing
      const results: CardData[] = [];
      for (const def of defs) {
        const workouts = await getTopWorkouts(def.metric, 1, def.filters);
        if (workouts.length > 0) {
          const topValue = workouts[0][def.metric as keyof Workout] as number | null;
          if (topValue != null && topValue > 0) {
            results.push({ def, topWorkout: workouts[0] });
          }
        }
      }

      if (!cancelled) {
        setCards(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading records...</p>;
  }

  if (cards.length === 0) {
    return <p className="text-sm text-gray-400">No personal records yet. Complete more workouts to see your bests.</p>;
  }

  // Group cards by their group label
  const groups: { label: string; cards: CardData[] }[] = [];
  for (const card of cards) {
    const existing = groups.find((g) => g.label === card.def.group);
    if (existing) {
      existing.cards.push(card);
    } else {
      groups.push({ label: card.def.group, cards: [card] });
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Records</h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{group.label}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card, i) => (
                <RecordCard key={i} data={card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
