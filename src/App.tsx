import { useEffect, useRef, useState } from "react";
import ApiSync from "./components/ApiSync";
import WorkoutList from "./components/WorkoutList";
import OutputChart from "./components/OutputChart";
import SetupWizard from "./components/SetupWizard";
import ReauthModal from "./components/ReauthModal";
import { checkForUpdate, installUpdate, UpdateStatus } from "./lib/updater";
import { syncWorkouts } from "./lib/sync";
import { getUserProfile, hasWorkouts, backfillClassTypes } from "./lib/database";
import { useSessionStore } from "./stores/sessionStore";
import { useEnrichmentStore } from "./stores/enrichmentStore";

type Tab = "workouts" | "charts" | "profile";

const AUTO_SYNC_KEY = "wattson:autoSyncOnLaunch";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("workouts");
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dataState, setDataState] = useState<"checking" | "empty" | "has_data">("checking");
  const [showWizard, setShowWizard] = useState(false);
  const autoSyncRan = useRef(false);

  const loadFromKeychain = useSessionStore((s) => s.loadFromKeychain);
  const loaded = useSessionStore((s) => s.loaded);
  const session = useSessionStore((s) => s.session);
  const userProfile = useSessionStore((s) => s.userProfile);

  useEffect(() => {
    loadFromKeychain();
    checkForUpdate().then((status) => {
      if (status.available) setUpdate(status);
    });
    backfillClassTypes().catch((e) => console.error("Class type backfill failed:", e));
    useEnrichmentStore.getState().loadState().catch((e) => console.error("Enrichment state load failed:", e));
  }, []);

  // On initial load, determine data state; load cached profile when session exists
  useEffect(() => {
    if (!loaded) return;
    if (session) {
      setDataState("has_data");
      getUserProfile(session.userId).then((profile) => {
        if (profile) useSessionStore.getState().setUserProfile(profile);
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

  // Auto-sync on launch when preference is enabled
  useEffect(() => {
    if (!loaded || !session || autoSyncRan.current) return;
    const pref = localStorage.getItem(AUTO_SYNC_KEY);
    if (pref !== "true") return;
    autoSyncRan.current = true;

    syncWorkouts().catch((e) => {
      console.error("Auto-sync failed:", e);
    });
  }, [loaded, session]);

  // Auto-resume enrichment backfill when session is available and mode is detailed
  const enrichmentMode = useEnrichmentStore((s) => s.mode);
  const backfillStatus = useEnrichmentStore((s) => s.backfillStatus);
  useEffect(() => {
    if (!loaded || !session) return;
    if (enrichmentMode === "detailed" && backfillStatus === "paused") {
      useEnrichmentStore.getState().startBackfill();
    }
  }, [loaded, session, enrichmentMode, backfillStatus]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await installUpdate();
    } catch (e) {
      console.error("Update failed:", e);
      setUpdating(false);
    }
  };

  function tabLabel(tab: Tab): string {
    if (tab === "profile") {
      if (userProfile) {
        const raw = JSON.parse(userProfile.raw_json);
        const username = raw.username as string | undefined;
        if (username) {
          return username;
        }
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
            {updating ? "Updating…" : "Update & Restart"}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold">Wattson</h1>
        <nav className="flex gap-2">
          {(["workouts", "charts", "profile"] as Tab[]).map((tab) => (
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === "workouts" && <WorkoutList />}
        {activeTab === "charts" && <OutputChart />}
        {activeTab === "profile" && <ApiSync onDataDeleted={() => { setDataState("empty"); setShowWizard(true); }} />}
      </main>

      <SetupWizard open={showWizard} onComplete={() => { setShowWizard(false); setDataState("has_data"); }} />
      <ReauthModal />
    </div>
  );
}

export default App;
