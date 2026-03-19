import type { DashboardWidget, WidgetType } from "../../types";
import { useDashboardContext } from "../../stores/DashboardContext";
import ChartWidget from "./ChartWidget";
import MetricTotalWidget from "./MetricTotalWidget";
import LastWorkoutWidget from "./LastWorkoutWidget";
import PersonalRecordWidget from "./PersonalRecordWidget";
import MostRepeatedWidget from "./MostRepeatedWidget";
import WorkoutListWidget from "./WorkoutListWidget";

const WIDGET_TITLES: Record<WidgetType, string> = {
  chart: "Chart",
  metric_total: "Metric",
  last_workout: "Last Workout",
  section: "Section",
  activity_grid: "Activity Grid",
  personal_record: "Personal Record",
  most_repeated: "Most Repeated",
  workout_list: "Workout List",
};

function getWidgetTitle(widget: DashboardWidget): string {
  const config = widget.config;
  if ("title" in config && config.title) return config.title;
  if (config.type === "chart" && config.chart.name) return config.chart.name;
  if (config.type === "metric_total" && config.label) return config.label;
  return WIDGET_TITLES[widget.widget_type] ?? widget.widget_type;
}

interface Props {
  widget: DashboardWidget;
}

export default function WidgetFullscreen({ widget }: Props) {
  const useStore = useDashboardContext();
  const expandWidget = useStore((s) => s.expandWidget);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{getWidgetTitle(widget)}</h2>
        <button
          onClick={() => expandWidget(null)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Exit Fullscreen
        </button>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-gray-200 bg-white p-4">
        {widget.config.type === "chart" && <ChartWidget widget={widget} fullscreen />}
        {widget.config.type === "metric_total" && <MetricTotalWidget widget={widget} fullscreen />}
        {widget.config.type === "last_workout" && <LastWorkoutWidget widget={widget} fullscreen />}
        {widget.config.type === "personal_record" && <PersonalRecordWidget widget={widget} fullscreen />}
        {widget.config.type === "most_repeated" && <MostRepeatedWidget widget={widget} fullscreen />}
        {widget.config.type === "workout_list" && <WorkoutListWidget widget={widget} fullscreen />}
      </div>
    </div>
  );
}
