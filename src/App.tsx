import { useEffect, useState } from "react";
import CsvImport from "./components/CsvImport";
import ApiSync from "./components/ApiSync";
import WorkoutList from "./components/WorkoutList";
import OutputChart from "./components/OutputChart";
import { checkForUpdate, installUpdate, UpdateStatus } from "./lib/updater";

type Tab = "workouts" | "charts" | "import" | "sync";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("workouts");
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    checkForUpdate().then((status) => {
      if (status.available) setUpdate(status);
    });
  }, []);

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
          {(["workouts", "charts", "import", "sync"] as Tab[]).map((tab) => (
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
        {activeTab === "import" && <CsvImport />}
        {activeTab === "sync" && <ApiSync />}
      </main>
    </div>
  );
}

export default App;
