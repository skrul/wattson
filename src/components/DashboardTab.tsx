import { useEffect } from "react";
import { useDashboardStore } from "../stores/dashboardStore";
import DashboardEmptyState from "./DashboardEmptyState";
import DashboardGrid from "./DashboardGrid";
import WidgetFullscreen from "./widgets/WidgetFullscreen";
import WidgetConfigModal from "./config/WidgetConfigModal";

export default function DashboardTab() {
  const dashboard = useDashboardStore((s) => s.dashboard);
  const expandedWidgetId = useDashboardStore((s) => s.expandedWidgetId);
  const mode = useDashboardStore((s) => s.mode);
  const configuringWidgetId = useDashboardStore((s) => s.configuringWidgetId);
  const addingWidgetType = useDashboardStore((s) => s.addingWidgetType);
  const loadDashboard = useDashboardStore((s) => s.loadDashboard);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm text-gray-400">Loading dashboard...</span>
      </div>
    );
  }

  if (expandedWidgetId) {
    const widget = dashboard.widgets.find((w) => w.id === expandedWidgetId);
    if (widget) return <WidgetFullscreen widget={widget} />;
  }

  if (dashboard.widgets.length === 0 && mode === "view") {
    return <DashboardEmptyState />;
  }

  return (
    <>
      {dashboard.widgets.length === 0 ? <DashboardEmptyState /> : <DashboardGrid dashboard={dashboard} />}
      {(configuringWidgetId || addingWidgetType) && <WidgetConfigModal />}
    </>
  );
}
