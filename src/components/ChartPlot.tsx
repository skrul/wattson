import { useRef, useEffect } from "react";
import type { Workout, ChartDefinition } from "../types";
import { renderCustomChart } from "../lib/charts";

interface ChartPlotProps {
  chart: ChartDefinition;
  workouts: Workout[];
  width?: number;
  height?: number;
}

export default function ChartPlot({ chart, workouts, width, height = 400 }: ChartPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (chart.y_fields.length === 0 || workouts.length === 0) {
      el.replaceChildren();
      return;
    }

    const w = width ?? (el.clientWidth || 800);
    const svg = renderCustomChart(workouts, chart, w, height);
    el.replaceChildren(svg);
  }, [chart, workouts, width, height]);

  if (chart.y_fields.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
        Select at least one Y-axis field to preview
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
        No matching workouts
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
