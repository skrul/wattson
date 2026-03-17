import { useRef, useEffect, useState } from "react";
import type { Workout, ChartDefinition } from "../types";
import { renderCustomChart } from "../lib/charts";

interface ChartPlotProps {
  chart: ChartDefinition;
  workouts: Workout[];
  width?: number;
  height?: number;
  /** Fill the parent's dimensions via ResizeObserver */
  fillContainer?: boolean;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      setSize((prev) => (prev.w === w && prev.h === h) ? prev : { w, h });
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);

  return size;
}

export default function ChartPlot({ chart, workouts, width, height = 400, fillContainer }: ChartPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useContainerSize(containerRef, !!fillContainer);

  // For non-fillContainer mode, observe own width only
  const [ownWidth, setOwnWidth] = useState(0);
  useEffect(() => {
    if (fillContainer) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => setOwnWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillContainer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (chart.y_fields.length === 0 || workouts.length === 0) {
      el.replaceChildren();
      return;
    }

    const w = width ?? ((fillContainer ? containerSize.w : ownWidth) || (el.clientWidth || 800));
    const h = fillContainer ? (containerSize.h || height) : height;
    if (w <= 0 || h <= 0) return;

    const svg = renderCustomChart(workouts, chart, w, h);
    el.replaceChildren(svg);
  }, [chart, workouts, width, height, fillContainer, containerSize, ownWidth]);

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

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
