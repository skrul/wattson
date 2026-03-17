import { useEffect, useState } from "react";
import { getCumulativeTotals, type CumulativeTotals as CumulativeTotalsData } from "../lib/database";

interface StatCard {
  label: string;
  value: string;
}

export default function CumulativeTotals({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const totals: CumulativeTotalsData = await getCumulativeTotals();

      const cards: StatCard[] = [
        { label: "Total Workouts", value: totals.total_workouts.toLocaleString() },
        { label: "Total Hours", value: Math.round(totals.total_duration_seconds / 3600).toLocaleString() },
        { label: "Total Calories", value: Math.round(totals.total_calories).toLocaleString() },
        { label: "Total Output (kj)", value: Math.round(totals.total_work_joules / 1000).toLocaleString() },
        { label: "Total Distance (mi)", value: totals.total_distance.toLocaleString(undefined, { maximumFractionDigits: 1 }) },
      ];

      if (!cancelled) {
        setStats(cards);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading totals...</p>;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Cumulative Totals</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="mt-1 text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
