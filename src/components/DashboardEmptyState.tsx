import { useDashboardContext } from "../stores/DashboardContext";
import AddWidgetMenu from "./config/AddWidgetMenu";

export default function DashboardEmptyState() {
  const useStore = useDashboardContext();
  const mode = useStore((s) => s.mode);
  const enterEditMode = useStore((s) => s.enterEditMode);

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <svg className="mb-4 h-16 w-16 text-gray-300" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="24" height="16" rx="2" />
        <rect x="36" y="4" width="24" height="24" rx="2" />
        <rect x="4" y="28" width="24" height="24" rx="2" />
        <rect x="36" y="36" width="24" height="16" rx="2" />
      </svg>
      <h2 className="mb-2 text-lg font-semibold text-gray-700">Your dashboard is empty</h2>
      <p className="mb-6 text-sm text-gray-500">Add widgets to track your metrics, charts, and ride details.</p>
      {mode === "edit" ? (
        <AddWidgetMenu primary />
      ) : (
        <button
          onClick={enterEditMode}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 2v12M2 8h12" />
          </svg>
          Add your first widget
        </button>
      )}
    </div>
  );
}
