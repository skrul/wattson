import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateStatus {
  available: boolean;
  version?: string;
  body?: string;
}

let cachedUpdate: Update | null = null;

export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const update = await check();
    if (update) {
      cachedUpdate = update;
      return {
        available: true,
        version: update.version,
        body: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

export async function installUpdate(): Promise<void> {
  if (!cachedUpdate) {
    throw new Error("No update available to install");
  }
  await cachedUpdate.downloadAndInstall();
  await relaunch();
}
