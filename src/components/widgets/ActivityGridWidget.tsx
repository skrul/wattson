import { useEffect, useRef, useState } from "react";
import type { DashboardWidget } from "../../types";
import { getDailyMetricValues } from "../../lib/database";
import type { DailyMetricValue } from "../../lib/database";
import { renderActivityGrid } from "../../lib/charts";
import { ACTIVITY_GRID_METRICS } from "../../lib/dashboardDefaults";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function ActivityGridWidget({ widget }: Props) {
  const [data, setData] = useState<DailyMetricValue[] | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  if (widget.config.type !== "activity_grid") return null;
  const { title, metric, color, filters } = widget.config;

  const metricDef = ACTIVITY_GRID_METRICS.find((m) => m.key === metric);
  const tooltipLabel = metricDef?.tooltipLabel ?? metric;

  useEffect(() => {
    setLoading(true);
    getDailyMetricValues(365, metric, filters)
      .then((v) => setData(v))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [metric, JSON.stringify(filters)]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;

    const render = () => {
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 160;
      const svg = renderActivityGrid(data, w, Math.max(h - 24, 100), tooltipLabel, color || "#216e39");
      el.replaceChildren(svg);
    };

    render();

    const observer = new ResizeObserver(render);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data, tooltipLabel, color]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-gray-400">No data</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {title && (
        <span className="mb-1 text-xs font-medium text-gray-500">{title}</span>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
