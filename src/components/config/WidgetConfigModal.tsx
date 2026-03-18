import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useDashboardStore } from "../../stores/dashboardStore";
import MetricTotalConfig from "./MetricTotalConfig";
import ChartWidgetConfig from "./ChartWidgetConfig";
import LastWorkoutConfig from "./LastWorkoutConfig";
import SectionConfig from "./SectionConfig";
import ActivityGridConfig from "./ActivityGridConfig";

export default function WidgetConfigModal() {
  const configuringWidgetId = useDashboardStore((s) => s.configuringWidgetId);
  const addingWidgetType = useDashboardStore((s) => s.addingWidgetType);
  const cancelConfiguring = useDashboardStore((s) => s.cancelConfiguring);
  const dashboard = useDashboardStore((s) => s.dashboard);

  const isAdding = addingWidgetType != null;
  const widget = configuringWidgetId
    ? dashboard?.widgets.find((w) => w.id === configuringWidgetId)
    : null;

  const widgetType = isAdding ? addingWidgetType : widget?.widget_type;
  if (!widgetType) return null;

  const WIDGET_LABELS: Record<string, string> = { metric_total: "Metric", chart: "Chart", last_workout: "Last Workout", section: "Section", activity_grid: "Activity Grid" };
  const title = isAdding ? `Add ${WIDGET_LABELS[widgetType] ?? widgetType} Widget` : "Configure Widget";

  return (
    <Dialog open onClose={cancelConfiguring} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="mb-4 text-lg font-semibold text-gray-900">{title}</DialogTitle>

          {widgetType === "metric_total" && (
            <MetricTotalConfig widget={widget ?? null} />
          )}
          {widgetType === "chart" && (
            <ChartWidgetConfig widget={widget ?? null} />
          )}
          {widgetType === "last_workout" && (
            <LastWorkoutConfig widget={widget ?? null} />
          )}
          {widgetType === "section" && (
            <SectionConfig widget={widget ?? null} />
          )}
          {widgetType === "activity_grid" && (
            <ActivityGridConfig widget={widget ?? null} />
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
