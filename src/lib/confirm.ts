import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

/**
 * Wrapper around Tauri's native confirm dialog.
 * In test mode (window.__WATTSON_SKIP_CONFIRM__ is set), auto-confirms
 * so that E2E tests aren't blocked by native OS dialogs.
 */
export async function confirm(message: string): Promise<boolean> {
  if ((window as any).__WATTSON_SKIP_CONFIRM__) return true;
  return tauriConfirm(message);
}
