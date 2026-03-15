import { useEffect, useRef, useState } from "react";
import ApiSync from "./components/ApiSync";
import WorkoutList from "./components/WorkoutList";
import OutputChart from "./components/OutputChart";
import SetupWizard from "./components/SetupWizard";
import ReauthModal from "./components/ReauthModal";
import { checkForUpdate, installUpdate, UpdateStatus } from "./lib/updater";
import { syncWorkouts } from "./lib/sync";
import { useSessionStore } from "./stores/sessionStore";

type Tab = "workouts" | "charts" | "sync";

const AUTO_SYNC_KEY = "wattson:autoSyncOnLaunch";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("workouts");
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const autoSyncRan = useRef(false);

  const loadFromKeychain = useSessionStore((s) => s.loadFromKeychain);
  const loaded = useSessionStore((s) => s.loaded);
  const session = useSessionStore((s) => s.session);

  useEffect(() => {
    loadFromKeychain();
    checkForUpdate().then((status) => {
      if (status.available) setUpdate(status);
    });
  }, []);

  // Show wizard when no session
  useEffect(() => {
    if (loaded && !session) {
      setShowWizard(true);
    }
  }, [loaded, session]);

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

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await installUpdate();
    } catch (e) {
      console.error("Update failed:", e);
      setUpdating(false);
    }
  };

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
          {(["workouts", "charts", "sync"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                activeTab === tab
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === "workouts" && <WorkoutList />}
        {activeTab === "charts" && <OutputChart />}
        {activeTab === "sync" && <ApiSync />}
      </main>

      <SetupWizard open={showWizard} onComplete={() => setShowWizard(false)} />
      <ReauthModal />
    </div>
  );
}

export default App;
