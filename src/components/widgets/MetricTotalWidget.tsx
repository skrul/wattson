import { useState, useEffect } from "react";
import type { DashboardWidget } from "../../types";
import { getMetricValue } from "../../lib/database";
import { PREDEFINED_METRICS } from "../../lib/dashboardDefaults";

interface Props {
  widget: DashboardWidget;
  fullscreen?: boolean;
}

export default function MetricTotalWidget({ widget }: Props) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  if (widget.config.type !== "metric_total") return null;
  const { metric, filters, label } = widget.config;

  const metricDef = PREDEFINED_METRICS.find((m) => m.key === metric);

  useEffect(() => {
    setLoading(true);
    getMetricValue(metric, filters)
      .then((v) => setValue(v))
      .catch(() => setValue(null))
      .finally(() => setLoading(false));
  }, [metric, JSON.stringify(filters)]);

  const formatted = value != null && metricDef ? metricDef.format(value) : "—";

  return (
    <div className="flex h-full flex-col items-center justify-center">
      {loading ? (
        <span className="text-sm text-gray-400">Loading...</span>
      ) : (
        <>
          <span className="text-3xl font-bold text-gray-900">{formatted}</span>
          <span className="mt-1 text-xs text-gray-500">{label || metricDef?.label || metric}</span>
        </>
      )}
    </div>
  );
}
