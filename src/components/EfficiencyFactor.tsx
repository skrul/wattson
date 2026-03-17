import { useEffect, useRef, useState } from "react";
import { getDisciplineCounts, getEfficiencyFactorData } from "../lib/database";
import { renderEFTrendChart } from "../lib/charts";
import type { DisciplineCount, EFDataPoint } from "../lib/database";

export default function EfficiencyFactor({ refreshKey }: { refreshKey: number }) {
  const [disciplines, setDisciplines] = useState<DisciplineCount[]>([]);
  const [discipline, setDiscipline] = useState("cycling");
  const [data, setData] = useState<EFDataPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load discipline list once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts = await getDisciplineCounts();
      if (!cancelled) setDisciplines(counts);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Load EF data when discipline changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const points = await getEfficiencyFactorData(discipline);
      if (!cancelled) {
        setData(points);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, discipline]);

  // Render chart
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;

    const chartData = data.map((d) => ({
      date: new Date(d.date * 1000),
      ef: d.avg_output / d.avg_heart_rate,
    }));

    if (chartData.length === 0) {
      el.replaceChildren();
      return;
    }

    const w = el.clientWidth || 800;
    const svg = renderEFTrendChart(chartData, w, 300);
    el.replaceChildren(svg);
  }, [data]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Efficiency Factor</h2>
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        >
          {disciplines.map((d) => (
            <option key={d.discipline} value={d.discipline}>
              {d.discipline}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading efficiency factor data...</p>
        ) : data && data.length === 0 ? (
          <p className="text-sm text-gray-400">No workouts with both output and heart rate data.</p>
        ) : (
          <div ref={containerRef} className="w-full overflow-x-auto" />
        )}
      </div>
    </section>
  );
}
