import os from "os";
import path from "path";
import { spawn } from "child_process";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Platform-specific binary name
const binaryName = process.platform === "win32" ? "wattson.exe" : "wattson";
const binaryPath = path.resolve(projectRoot, "src-tauri", "target", "debug", binaryName);

// NOTE: We intentionally do NOT set WATTSON_NO_KEYCHAIN here.
// This config runs against the user's real synced data and real keychain credentials.

let tauriWd;
let exit = false;

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./test/specs/screenshots.e2e.js"],
  maxInstances: 1,
  connectionRetryCount: 10,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        binary: binaryPath,
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },

  // Build the app with the real (default) config, or a user-specified config.
  // No fake server env vars — this uses the real Peloton API.
  onPrepare: () => {
    console.log("Building Tauri app for screenshots...");
    const args = ["tauri", "build", "--debug", "--no-bundle"];
    const customConfig = process.env.TAURI_SCREENSHOT_CONFIG;
    if (customConfig) {
      const configPath = path.resolve(customConfig);
      args.push("--config", configPath);
      console.log(`  Using custom config: ${customConfig}`);
    } else {
      console.log("  Using default config (real app identifier: com.skrul.wattson)");
    }

    const result = spawnSync("pnpm", args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) {
      throw new Error(`Tauri build failed with exit code ${result.status}`);
    }

    // No database cleanup — we want the user's real data.
  },

  // Start tauri-wd before the session (no fake server needed)
  beforeSession: () => {
    const tauriWdBin = path.resolve(os.homedir(), ".cargo", "bin", "tauri-wd");
    tauriWd = spawn(tauriWdBin, ["--port", "4444"], {
      stdio: [null, process.stdout, process.stderr],
    });
    tauriWd.on("error", (error) => {
      console.error("tauri-wd error:", error);
      process.exit(1);
    });
    tauriWd.on("exit", (code) => {
      if (!exit) {
        console.error("tauri-wd exited with code:", code);
        process.exit(1);
      }
    });

    return new Promise((resolve) => setTimeout(resolve, 2000));
  },

  afterSession: () => {
    cleanup();
  },
};

function cleanup() {
  exit = true;
  tauriWd?.kill();
}

function onShutdown(fn) {
  const handler = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on("exit", handler);
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  process.on("SIGHUP", handler);
}

onShutdown(cleanup);
