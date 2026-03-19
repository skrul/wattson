import { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useDashboardRegistryStore } from "../../stores/dashboardRegistryStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ManageDashboardsModal({ open, onClose }: Props) {
  const dashboards = useDashboardRegistryStore((s) => s.dashboards);
  const addDashboard = useDashboardRegistryStore((s) => s.addDashboard);
  const removeDashboard = useDashboardRegistryStore((s) => s.removeDashboard);
  const renameDashboard = useDashboardRegistryStore((s) => s.renameDashboard);
  const reorderDashboards = useDashboardRegistryStore((s) => s.reorderDashboards);
  const resetDashboard = useDashboardRegistryStore((s) => s.resetDashboard);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEditing = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const commitEdit = async () => {
    if (editingId && editingName.trim()) {
      await renameDashboard(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const ids = dashboards.map((d) => d.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderDashboards(ids);
  };

  const moveDown = (index: number) => {
    if (index >= dashboards.length - 1) return;
    const ids = dashboards.map((d) => d.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderDashboards(ids);
  };

  return (
    <Dialog open={open} onClose={() => {}} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">Manage Dashboards</DialogTitle>

          <div className="mt-4 space-y-2">
            {dashboards.map((d, i) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                {/* Reorder buttons */}
                <div className="flex flex-col">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-25"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === dashboards.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-25"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Name */}
                <div className="flex-1">
                  {editingId === d.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                      }}
                      autoFocus
                      className="w-full rounded border border-blue-400 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <button
                      onClick={() => startEditing(d.id, d.name)}
                      className="w-full text-left text-sm font-medium text-gray-900 hover:text-blue-600"
                    >
                      {d.name}
                    </button>
                  )}
                </div>

                {/* Reset to defaults (only for built-in dashboards) */}
                {d.default_key && (
                  <button
                    onClick={async () => {
                      if (await window.confirm(`Reset "${d.name}" to defaults? This will replace all widgets.`)) {
                        resetDashboard(d.id);
                      }
                    }}
                    className="text-gray-400 hover:text-blue-600"
                    title="Reset to defaults"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}

                {/* Delete */}
                <button
                  onClick={() => removeDashboard(d.id)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-25"
                  title={i === 0 ? "Cannot delete the first dashboard" : "Delete dashboard"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add Dashboard */}
          <button
            onClick={() => addDashboard("New Dashboard")}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
          >
            + Add Dashboard
          </button>

          {/* Footer */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
