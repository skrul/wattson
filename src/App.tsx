import { useEffect, useRef, useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
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
import { STORAGE_KEYS } from "./lib/storageKeys";

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
    useEnrichmentStore.getState().loadState().catch(() => {});
    useShareChartStore.getState().load().catch(() => {});
    useDashboardRegistryStore.getState().loadRegistry().catch(() => {});
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
          const pref = localStorage.getItem(STORAGE_KEYS.autoSyncOnLaunch);
          if (pref !== "false") {
            autoSyncRan.current = true;
            syncWorkouts().catch(() => {});
          }
        }
      }).catch(() => {});
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
    } catch {
      setUpdating(false);
    }
  };

  // Build tab array: dashboard tabs first, then fixed tabs
  const fixedTabs = ["workouts", "studio"] as const;
  const allTabs: string[] = [
    ...dashboards.map((d) => makeDashboardTab(d.id)),
    ...fixedTabs,
  ];

  function tabLabel(tab: string): string {
    if (isDashboardTab(tab)) {
      const d = dashboards.find((d) => makeDashboardTab(d.id) === tab);
      return d?.name ?? "Dashboard";
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
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Wattson</h1>
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
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const isActive = isSyncing || backfillStatus === "running";
            const progressText = isSyncing && syncProgress
              ? `Syncing ${syncProgress.fetched} / ${syncProgress.total}`
              : !isSyncing && backfillStatus === "running" && totalCount > 0
                ? `Details ${enrichedCount} / ${totalCount}`
                : null;
            return (
              <button
                onClick={() => {
                  if (!isActive) syncWorkouts().catch(() => {});
                }}
                className={`flex items-center gap-1.5 rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 ${
                  progressText ? "py-1 pl-1.5 pr-2.5" : "p-1.5"
                }`}
                title={isSyncing ? "Syncing…" : backfillStatus === "running" ? "Enriching…" : "Sync workouts"}
                disabled={isActive}
              >
                <svg className={`h-4 w-4 ${isActive ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2.5 8a5.5 5.5 0 0 1 9.3-4" />
                  <path d="M13.5 8a5.5 5.5 0 0 1-9.3 4" />
                  <path d="M11.8 4l1.2-.8L13.5 4.8" />
                  <path d="M4.2 12l-1.2.8L2.5 11.2" />
                </svg>
                {progressText && (
                  <span className="text-xs text-gray-500">{progressText}</span>
                )}
              </button>
            );
          })()}
          <Popover className="relative flex items-center">
            <PopoverButton
              className="rounded-full data-[open]:ring-2 data-[open]:ring-gray-900 hover:ring-2 hover:ring-gray-300 focus:outline-none"
              title="Account"
            >
              {(() => {
                const imageUrl = userProfile
                  ? (JSON.parse(userProfile.raw_json).image_url as string | undefined)
                  : undefined;
                return imageUrl ? (
                  <img src={imageUrl} alt="Profile" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-500">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                );
              })()}
            </PopoverButton>
            <PopoverPanel
              anchor="bottom end"
              className="z-50 mt-2 w-96 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
            >
              <ApiSync onDataDeleted={() => { setDataState("empty"); setShowWizard(true); }} />
            </PopoverPanel>
          </Popover>
        </div>
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
      </div>

      <SetupWizard open={showWizard} onComplete={() => { setShowWizard(false); setDataState("has_data"); }} />
      <ReauthModal />
    </div>
  );
}

export default App;
