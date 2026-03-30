import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database — dashboard store calls saveDashboardWidgets on every mutation
const mockSaveDashboardWidgets = vi.fn().mockResolvedValue(undefined);
const mockGetOrCreateDashboard = vi.fn();
const mockGetOrCreateDashboardByName = vi.fn();
const mockGetDashboardById = vi.fn();

vi.mock("../lib/database", () => ({
  saveDashboardWidgets: (...args: unknown[]) => mockSaveDashboardWidgets(...args),
  getOrCreateDashboard: (...args: unknown[]) => mockGetOrCreateDashboard(...args),
  getOrCreateDashboardByName: (...args: unknown[]) => mockGetOrCreateDashboardByName(...args),
  getDashboardById: (...args: unknown[]) => mockGetDashboardById(...args),
}));

import { createDashboardStore, createDashboardStoreById } from "./dashboardStore";
import type { Dashboard, DashboardWidget, WidgetConfig } from "../types";

function makeDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: "dash-1",
    name: "Test Dashboard",
    widgets: [],
    created_at: 1704067200,
    updated_at: 1704067200,
    ...overrides,
  };
}

function makeSectionConfig(): WidgetConfig {
  return { type: "section", title: "Test Section" };
}

function makeMetricConfig(): WidgetConfig {
  return { type: "metric_total", metric: "total_output", label: "Output", filters: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDashboardStore", () => {
  it("loads a dashboard by name", async () => {
    const dashboard = makeDashboard();
    mockGetOrCreateDashboard.mockResolvedValue(dashboard);

    const useStore = createDashboardStore("Home");
    await useStore.getState().loadDashboard();

    expect(useStore.getState().dashboard).toEqual(dashboard);
    expect(mockGetOrCreateDashboard).toHaveBeenCalled();
  });

  it("loads a non-Home dashboard by name", async () => {
    const dashboard = makeDashboard({ name: "Insights" });
    mockGetOrCreateDashboardByName.mockResolvedValue(dashboard);

    const useStore = createDashboardStore("Insights");
    await useStore.getState().loadDashboard();

    expect(useStore.getState().dashboard).toEqual(dashboard);
    expect(mockGetOrCreateDashboardByName).toHaveBeenCalledWith("Insights");
  });
});

describe("createDashboardStoreById", () => {
  it("loads a dashboard by ID", async () => {
    const dashboard = makeDashboard({ id: "abc-123" });
    mockGetDashboardById.mockResolvedValue(dashboard);

    const useStore = createDashboardStoreById("abc-123");
    await useStore.getState().loadDashboard();

    expect(useStore.getState().dashboard).toEqual(dashboard);
    expect(mockGetDashboardById).toHaveBeenCalledWith("abc-123");
  });
});

describe("widget operations", () => {
  function setupStore(widgets: DashboardWidget[] = []) {
    const dashboard = makeDashboard({ widgets });
    const useStore = createDashboardStore("Home");
    // Directly set the dashboard to avoid async loading
    useStore.setState({ dashboard });
    return useStore;
  }

  describe("addWidget", () => {
    it("adds a widget to an empty dashboard", () => {
      const useStore = setupStore();

      useStore.getState().addWidget("section", makeSectionConfig());

      const { dashboard } = useStore.getState();
      expect(dashboard!.widgets).toHaveLength(1);
      expect(dashboard!.widgets[0].widget_type).toBe("section");
      expect(dashboard!.widgets[0].config).toEqual(makeSectionConfig());
      expect(dashboard!.widgets[0].id).toBeTruthy();
    });

    it("assigns correct default layout", () => {
      const useStore = setupStore();

      useStore.getState().addWidget("metric_total", makeMetricConfig());

      const widget = useStore.getState().dashboard!.widgets[0];
      // metric_total defaults: defaultW: 4, defaultH: 3, minW: 3, minH: 3
      expect(widget.layout.w).toBe(4);
      expect(widget.layout.h).toBe(3);
      expect(widget.layout.minW).toBe(3);
      expect(widget.layout.minH).toBe(3);
      expect(widget.layout.x).toBe(0);
      expect(widget.layout.y).toBe(0); // empty dashboard → placed at top
    });

    it("places new widget below existing widgets", () => {
      const existing: DashboardWidget = {
        id: "existing-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 2 },
      };
      const useStore = setupStore([existing]);

      useStore.getState().addWidget("metric_total", makeMetricConfig());

      const newWidget = useStore.getState().dashboard!.widgets[1];
      // Should be placed at y = 0 + 2 = 2 (bottom of existing widget)
      expect(newWidget.layout.y).toBe(2);
    });

    it("layout survives JSON round-trip (no Infinity)", () => {
      const existing: DashboardWidget = {
        id: "existing-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 5 },
      };
      const useStore = setupStore([existing]);

      useStore.getState().addWidget("metric_total", makeMetricConfig());

      const widget = useStore.getState().dashboard!.widgets[1];
      const json = JSON.stringify(widget.layout);
      const parsed = JSON.parse(json);

      // y must survive serialization — Infinity becomes null in JSON, breaking layout on reload
      expect(parsed.y).toBe(widget.layout.y);
      expect(parsed.y).toBe(5);
    });

    it("persists to database after adding", async () => {
      const useStore = setupStore();

      useStore.getState().addWidget("section", makeSectionConfig());
      await vi.waitFor(() => expect(mockSaveDashboardWidgets).toHaveBeenCalledTimes(1));
      expect(mockSaveDashboardWidgets).toHaveBeenCalledWith(
        "dash-1",
        expect.arrayContaining([expect.objectContaining({ widget_type: "section" })]),
      );
    });

    it("clears addingWidgetType and configuringWidgetId", () => {
      const useStore = setupStore();
      useStore.setState({ addingWidgetType: "chart", configuringWidgetId: "old-id" });

      useStore.getState().addWidget("section", makeSectionConfig());

      expect(useStore.getState().addingWidgetType).toBeNull();
      expect(useStore.getState().configuringWidgetId).toBeNull();
    });

    it("does nothing if dashboard is null", () => {
      const useStore = createDashboardStore("Home");
      // dashboard is null by default

      useStore.getState().addWidget("section", makeSectionConfig());

      expect(useStore.getState().dashboard).toBeNull();
      expect(mockSaveDashboardWidgets).not.toHaveBeenCalled();
    });

    it("appends to existing widgets", () => {
      const existing: DashboardWidget = {
        id: "existing-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 2 },
      };
      const useStore = setupStore([existing]);

      useStore.getState().addWidget("metric_total", makeMetricConfig());

      const widgets = useStore.getState().dashboard!.widgets;
      expect(widgets).toHaveLength(2);
      expect(widgets[0].id).toBe("existing-1");
      expect(widgets[1].widget_type).toBe("metric_total");
    });
  });

  describe("removeWidget", () => {
    it("removes a widget by ID", () => {
      const widget: DashboardWidget = {
        id: "w-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 2 },
      };
      const useStore = setupStore([widget]);

      useStore.getState().removeWidget("w-1");

      expect(useStore.getState().dashboard!.widgets).toHaveLength(0);
    });

    it("persists to database after removing", async () => {
      const widget: DashboardWidget = {
        id: "w-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 2 },
      };
      const useStore = setupStore([widget]);

      useStore.getState().removeWidget("w-1");

      await vi.waitFor(() => expect(mockSaveDashboardWidgets).toHaveBeenCalledWith("dash-1", []));
    });

    it("only removes the targeted widget, leaving others intact", () => {
      const widgets: DashboardWidget[] = [
        { id: "w-1", widget_type: "section", config: makeSectionConfig(), layout: { x: 0, y: 0, w: 24, h: 2 } },
        { id: "w-2", widget_type: "metric_total", config: makeMetricConfig(), layout: { x: 0, y: 2, w: 4, h: 3 } },
        { id: "w-3", widget_type: "section", config: makeSectionConfig(), layout: { x: 0, y: 5, w: 24, h: 2 } },
      ];
      const useStore = setupStore(widgets);

      useStore.getState().removeWidget("w-2");

      const remaining = useStore.getState().dashboard!.widgets;
      expect(remaining).toHaveLength(2);
      expect(remaining.map((w) => w.id)).toEqual(["w-1", "w-3"]);
    });

    it("does nothing for a non-existent widget ID", () => {
      const widget: DashboardWidget = {
        id: "w-1",
        widget_type: "section",
        config: makeSectionConfig(),
        layout: { x: 0, y: 0, w: 24, h: 2 },
      };
      const useStore = setupStore([widget]);

      useStore.getState().removeWidget("nonexistent");

      expect(useStore.getState().dashboard!.widgets).toHaveLength(1);
    });

    it("does nothing if dashboard is null", () => {
      const useStore = createDashboardStore("Home");

      useStore.getState().removeWidget("w-1");

      expect(mockSaveDashboardWidgets).not.toHaveBeenCalled();
    });
  });

  describe("add then remove (full flow)", () => {
    it("can add a widget and then remove it", async () => {
      const useStore = setupStore();

      // Add
      useStore.getState().addWidget("metric_total", makeMetricConfig());
      expect(useStore.getState().dashboard!.widgets).toHaveLength(1);

      const addedId = useStore.getState().dashboard!.widgets[0].id;

      // Remove
      useStore.getState().removeWidget(addedId);
      expect(useStore.getState().dashboard!.widgets).toHaveLength(0);

      // Verify persistence was called for both operations
      await vi.waitFor(() => expect(mockSaveDashboardWidgets).toHaveBeenCalledTimes(2));
    });

    it("can add multiple widgets and remove one", () => {
      const useStore = setupStore();

      useStore.getState().addWidget("section", makeSectionConfig());
      useStore.getState().addWidget("metric_total", makeMetricConfig());
      useStore.getState().addWidget("section", { type: "section", title: "Another" });

      expect(useStore.getState().dashboard!.widgets).toHaveLength(3);

      const middleId = useStore.getState().dashboard!.widgets[1].id;
      useStore.getState().removeWidget(middleId);

      const remaining = useStore.getState().dashboard!.widgets;
      expect(remaining).toHaveLength(2);
      expect(remaining[0].widget_type).toBe("section");
      expect(remaining[1].config).toEqual({ type: "section", title: "Another" });
    });
  });

  describe("updateWidgetConfig", () => {
    it("updates config for a specific widget", () => {
      const widget: DashboardWidget = {
        id: "w-1",
        widget_type: "metric_total",
        config: makeMetricConfig(),
        layout: { x: 0, y: 0, w: 4, h: 3 },
      };
      const useStore = setupStore([widget]);

      const newConfig: WidgetConfig = { type: "metric_total", metric: "calories", label: "Calories", filters: [] };
      useStore.getState().updateWidgetConfig("w-1", newConfig);

      expect(useStore.getState().dashboard!.widgets[0].config).toEqual(newConfig);
      expect(useStore.getState().configuringWidgetId).toBeNull();
    });
  });

  describe("updateLayouts", () => {
    it("updates positions for widgets", () => {
      const widgets: DashboardWidget[] = [
        { id: "w-1", widget_type: "section", config: makeSectionConfig(), layout: { x: 0, y: 0, w: 24, h: 2 } },
        { id: "w-2", widget_type: "metric_total", config: makeMetricConfig(), layout: { x: 0, y: 2, w: 4, h: 3 } },
      ];
      const useStore = setupStore(widgets);

      useStore.getState().updateLayouts([
        { i: "w-1", x: 0, y: 5, w: 24, h: 2 },
        { i: "w-2", x: 4, y: 0, w: 8, h: 4 },
      ]);

      const updated = useStore.getState().dashboard!.widgets;
      expect(updated[0].layout).toMatchObject({ x: 0, y: 5, w: 24, h: 2 });
      expect(updated[1].layout).toMatchObject({ x: 4, y: 0, w: 8, h: 4 });
    });
  });

  describe("edit mode", () => {
    it("starts in view mode", () => {
      const useStore = setupStore();
      expect(useStore.getState().mode).toBe("view");
    });

    it("can enter and exit edit mode", () => {
      const useStore = setupStore();

      useStore.getState().enterEditMode();
      expect(useStore.getState().mode).toBe("edit");

      useStore.getState().exitEditMode();
      expect(useStore.getState().mode).toBe("view");
    });

    it("clears configuringWidgetId and addingWidgetType on exit", () => {
      const useStore = setupStore();
      useStore.setState({ configuringWidgetId: "w-1", addingWidgetType: "chart" });

      useStore.getState().exitEditMode();

      expect(useStore.getState().configuringWidgetId).toBeNull();
      expect(useStore.getState().addingWidgetType).toBeNull();
    });

    it("can add and remove widgets while in edit mode", () => {
      const useStore = setupStore();

      useStore.getState().enterEditMode();
      useStore.getState().addWidget("section", makeSectionConfig());
      const id = useStore.getState().dashboard!.widgets[0].id;

      useStore.getState().removeWidget(id);
      expect(useStore.getState().dashboard!.widgets).toHaveLength(0);

      // Still in edit mode
      expect(useStore.getState().mode).toBe("edit");
    });
  });
});
