import { useEffect, useRef } from "react";
import { getDashboardStore, useDashboardRegistryStore } from "../stores/dashboardRegistryStore";
import { DashboardContext } from "../stores/DashboardContext";
import { saveDashboardWidgets } from "../lib/database";
import { buildDefaultInsightsWidgets } from "../lib/dashboardDefaults";
import DashboardEmptyState from "./DashboardEmptyState";
import DashboardGrid from "./DashboardGrid";
import WidgetFullscreen from "./widgets/WidgetFullscreen";
import WidgetConfigModal from "./config/WidgetConfigModal";

interface Props {
  dashboardId: string;
}

export default function DashboardTab({ dashboardId }: Props) {
  const useStore = getDashboardStore(dashboardId);
  const dashboard = useStore((s) => s.dashboard);
  const expandedWidgetId = useStore((s) => s.expandedWidgetId);
  const mode = useStore((s) => s.mode);
  const configuringWidgetId = useStore((s) => s.configuringWidgetId);
  const addingWidgetType = useStore((s) => s.addingWidgetType);
  const loadDashboard = useStore((s) => s.loadDashboard);
  const populated = useRef(false);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-populate Insights dashboard with default widgets on first load when empty
  const defaultKey = useDashboardRegistryStore(
    (s) => s.dashboards.find((d) => d.id === dashboardId)?.default_key,
  );

  useEffect(() => {
    if (!dashboard || populated.current) return;
    if (dashboard.widgets.length > 0 || defaultKey !== "insights") {
      populated.current = true;
      return;
    }
    populated.current = true;

    const defaultWidgets = buildDefaultInsightsWidgets();
    const updatedDashboard = { ...dashboard, widgets: defaultWidgets };
    useStore.setState({ dashboard: updatedDashboard });
    saveDashboardWidgets(dashboard.id, defaultWidgets).catch(() => {});
  }, [dashboard, defaultKey, useStore]);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-gray-400">Loading dashboard...</span>
      </div>
    );
  }

  if (expandedWidgetId) {
    const widget = dashboard.widgets.find((w) => w.id === expandedWidgetId);
    if (widget) return (
      <DashboardContext.Provider value={useStore}>
        <WidgetFullscreen widget={widget} />
      </DashboardContext.Provider>
    );
  }

  if (dashboard.widgets.length === 0 && mode === "view") {
    return (
      <DashboardContext.Provider value={useStore}>
        <DashboardEmptyState />
      </DashboardContext.Provider>
    );
  }

  return (
    <DashboardContext.Provider value={useStore}>
      {dashboard.widgets.length === 0 ? <DashboardEmptyState /> : <DashboardGrid dashboard={dashboard} />}
      {(configuringWidgetId || addingWidgetType) && <WidgetConfigModal />}
    </DashboardContext.Provider>
  );
}
