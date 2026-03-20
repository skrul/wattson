import { useEffect, useRef, useState } from "react";
import ApiSync from "./components/ApiSync";
import WorkoutList from "./components/WorkoutList";
import DashboardTab from "./components/DashboardTab";
import StudioTab from "./components/StudioTab";
import SetupWizard from "./components/SetupWizard";
import ReauthModal from "./components/ReauthModal";
import { checkForUpdate, installUpdate, UpdateStatus } from "./lib/updater";
import { syncWorkouts } from "./lib/sync";
import { getUserProfile, hasWorkouts } from "./lib/database";
import { useSessionStore } from "./stores/sessionStore";
import { useEnrichmentStore } from "./stores/enrichmentStore";
import { useNavigationStore, isDashboardTab, makeDashboardTab } from "./stores/navigationStore";
import { useShareChartStore } from "./stores/shareChartStore";
import { useDashboardRegistryStore } from "./stores/dashboardRegistryStore";

const AUTO_SYNC_KEY = "wattson:autoSyncOnLaunch";

function App() {
  const activeTab = useNavigationStore((s) => s.activeTab);
  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dataState, setDataState] = useState<"checking" | "empty" | "has_data">("checking");
  const [showWizard, setShowWizard] = useState(false);
  const autoSyncRan = useRef(false);

  const loadFromKeychain = useSessionStore((s) => s.loadFromKeychain);
  const loaded = useSessionStore((s) => s.loaded);
  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);
  const isSyncing = useSessionStore((s) => s.isSyncing);
  const syncProgress = useSessionStore((s) => s.syncProgress);
  const backfillStatus = useEnrichmentStore((s) => s.backfillStatus);
  const enrichedCount = useEnrichmentStore((s) => s.enrichedCount);
  const totalCount = useEnrichmentStore((s) => s.totalCount);

  const dashboards = useDashboardRegistryStore((s) => s.dashboards);
  const registryLoaded = useDashboardRegistryStore((s) => s.loaded);

  useEffect(() => {
    loadFromKeychain();
    checkForUpdate().then((status) => {
      if (status.available) setUpdate(status);
    });
    useEnrichmentStore.getState().loadState().catch((e) => console.error("Enrichment state load failed:", e));
    useShareChartStore.getState().load().catch((e) => console.error("Share chart settings load failed:", e));
    useDashboardRegistryStore.getState().loadRegistry().catch((e) => console.error("Dashboard registry load failed:", e));
  }, []);

  // After registry loads, set activeTab to first dashboard tab
  const initialTabSet = useRef(false);
  useEffect(() => {
    if (!registryLoaded || dashboards.length === 0) return;
    const { activeTab } = useNavigationStore.getState();

    if (!initialTabSet.current) {
      // On first load, always navigate to the first dashboard
      initialTabSet.current = true;
      if (!isDashboardTab(activeTab)) {
        setActiveTab(makeDashboardTab(dashboards[0].id));
      }
    } else {
      // On subsequent updates, only fix invalid dashboard tabs
      if (isDashboardTab(activeTab) && !dashboards.some((d) => makeDashboardTab(d.id) === activeTab)) {
        setActiveTab(makeDashboardTab(dashboards[0].id));
      }
    }
  }, [registryLoaded, dashboards, setActiveTab]);

  // On initial load, determine data state; load cached profile when session exists
  useEffect(() => {
    if (!loaded) return;
    if (session) {
      setDataState("has_data");
      getUserProfile(session.userId).then(async (profile) => {
        if (profile) useSessionStore.getState().setUserProfile(profile);
        // Auto-sync after profile is loaded so early-stop optimization works
        if (!autoSyncRan.current && !showWizard) {
          const pref = localStorage.getItem(AUTO_SYNC_KEY);
          if (pref !== "false") {
            autoSyncRan.current = true;
            syncWorkouts().catch((e) => { console.error("Auto-sync failed:", e); });
          }
        }
      }).catch((e) => console.error("Failed to load cached profile:", e));
    } else if (dataState === "checking") {
      // Only check DB on first load — sign-out keeps existing dataState
      hasWorkouts().then((has) => {
        setDataState(has ? "has_data" : "empty");
        if (!has) setShowWizard(true);
      }).catch(() => {
        setDataState("empty");
        setShowWizard(true);
      });
    }
  }, [loaded, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resume enrichment backfill once on launch when session is available
  const autoResumeRan = useRef(false);
  useEffect(() => {
    if (!loaded || !session || autoResumeRan.current || showWizard) return;
    const { backfillStatus } = useEnrichmentStore.getState();
    if (backfillStatus === "paused") {
      autoResumeRan.current = true;
      useEnrichmentStore.getState().startBackfill();
    }
  }, [loaded, session, showWizard]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await installUpdate();
    } catch (e) {
      console.error("Update failed:", e);
      setUpdating(false);
    }
  };

  // Build tab array: dashboard tabs first, then fixed tabs
  const fixedTabs = ["workouts", "studio", "profile"] as const;
  const allTabs: string[] = [
    ...dashboards.map((d) => makeDashboardTab(d.id)),
    ...fixedTabs,
  ];

  function tabLabel(tab: string): string {
    if (isDashboardTab(tab)) {
      const d = dashboards.find((d) => makeDashboardTab(d.id) === tab);
      return d?.name ?? "Dashboard";
    }
    if (tab === "profile") {
      if (userProfile) {
        const raw = JSON.parse(userProfile.raw_json);
        const username = raw.username as string | undefined;
        if (username) return username;
      }
      return "Account";
    }
    return tab.charAt(0).toUpperCase() + tab.slice(1);
  }

  return (
    <div className="flex h-screen flex-col bg-white text-gray-900">
      {/* Update banner */}
      {update?.available && (
        <div className="flex items-center justify-between bg-blue-600 px-6 py-2 text-sm text-white">
          <span>Wattson v{update.version} is available.</span>
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="rounded bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {updating ? "Updating\u2026" : "Update & Restart"}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Wattson</h1>
          {(isSyncing || backfillStatus === "running") && (
            <button
              onClick={() => setActiveTab("profile")}
              className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-200"
              title="Click to view sync details"
            >
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2.5 8a5.5 5.5 0 0 1 9.3-4" />
                <path d="M13.5 8a5.5 5.5 0 0 1-9.3 4" />
                <path d="M11.8 4l1.2-.8L13.5 4.8" />
                <path d="M4.2 12l-1.2.8L2.5 11.2" />
              </svg>
              {isSyncing
                ? (syncProgress
                  ? `Syncing ${syncProgress.fetched} / ${syncProgress.total}`
                  : "Syncing\u2026")
                : `Details ${enrichedCount} / ${totalCount}`}
            </button>
          )}
        </div>
        <nav className="flex gap-2">
          {allTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                activeTab === tab
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </nav>
      </header>

      {/* Content — all tabs stay mounted to preserve scroll position and avoid re-fetching.
           Dashboard tabs use visibility+absolute instead of display:none so that
           react-grid-layout always has a real container width and items don't
           animate on tab switch. */}
      <div className="relative flex-1">
        {dashboards.map((d) => {
          const tab = makeDashboardTab(d.id);
          const active = activeTab === tab;
          return (
            <div
              key={d.id}
              className={`absolute inset-0 overflow-y-auto p-6 ${active ? "visible z-10" : "invisible z-0"}`}
            >
              <DashboardTab dashboardId={d.id} />
            </div>
          );
        })}
        <div className={`absolute inset-0 overflow-y-auto p-6 ${activeTab === "workouts" ? "visible z-10" : "invisible z-0"}`}>
          <WorkoutList />
        </div>
        <div className={`absolute inset-0 overflow-y-auto p-6 ${activeTab === "studio" ? "visible z-10" : "invisible z-0"}`}>
          <StudioTab />
        </div>
        <div className={`absolute inset-0 overflow-y-auto p-6 ${activeTab === "profile" ? "visible z-10" : "invisible z-0"}`}>
          <ApiSync onDataDeleted={() => { setDataState("empty"); setShowWizard(true); }} />
        </div>
      </div>

      <SetupWizard open={showWizard} onComplete={() => { setShowWizard(false); setDataState("has_data"); }} />
      <ReauthModal />
    </div>
  );
}

export default App;
