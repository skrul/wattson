import os from "os";
import path from "path";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Test app uses a separate identifier to avoid clobbering dev data
const TEST_APP_ID = "com.skrul.wattson.test";
const testConfig = path.resolve(projectRoot, "src-tauri", "tauri.conf.test.json");

// Platform-specific binary name
const binaryName = process.platform === "win32" ? "wattson.exe" : "wattson";
const binaryPath = path.resolve(projectRoot, "src-tauri", "target", "debug", binaryName);

// Tauri app data directory (where sqlite:wattson.db lives)
function getAppDataDir() {
  switch (process.platform) {
    case "linux":
      return path.join(os.homedir(), ".local", "share", TEST_APP_ID);
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", TEST_APP_ID);
    case "win32":
      return path.join(process.env.APPDATA || "", TEST_APP_ID);
    default:
      return "";
  }
}

// Disable system keychain in the app — credentials stay in-memory during tests.
// This propagates through tauri-wd to the spawned app binary.
process.env.WATTSON_NO_KEYCHAIN = "1";

let tauriWd;
let fakeServer;
let exit = false;

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./test/specs/**/*.js"],
  exclude: ["./test/specs/screenshots.e2e.js"],
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
    timeout: 60_000,
  },

  // Build the app with env vars pointing to the fake server
  onPrepare: () => {
    console.log("Building Tauri app with fake server env vars...");
    const result = spawnSync("pnpm", ["tauri", "build", "--debug", "--no-bundle", "--config", testConfig], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        VITE_API_BASE: "http://localhost:3001",
        VITE_AUTH_URL: "http://localhost:3001/oauth/token",
        VITE_ENRICHMENT_DELAY_MS: "0",
      },
    });
    if (result.status !== 0) {
      throw new Error(`Tauri build failed with exit code ${result.status}`);
    }

    // Delete the app's databases for a clean start
    const appDataDir = getAppDataDir();
    for (const dbName of ["wattson.db", "enrichment_cache.db"]) {
      const dbPath = path.join(appDataDir, dbName);
      if (fs.existsSync(dbPath)) {
        console.log(`Deleting existing database: ${dbPath}`);
        fs.unlinkSync(dbPath);
      }
      // Also delete WAL/SHM files
      for (const suffix of ["-wal", "-shm"]) {
        const p = dbPath + suffix;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  },

  // Start the fake server and tauri-wd before each session
  beforeSession: () => {
    // Start fake Peloton server
    fakeServer = spawn("node", ["server.js"], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
    });
    fakeServer.stdout.on("data", (d) => process.stdout.write(`[fake-server] ${d}`));
    fakeServer.stderr.on("data", (d) => process.stderr.write(`[fake-server] ${d}`));

    // Start tauri-wd (macOS-compatible WebDriver from tauri-webdriver)
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

    // Wait a moment for both processes to be ready
    return new Promise((resolve) => setTimeout(resolve, 2000));
  },

  // Clean up after session
  afterSession: () => {
    cleanup();
  },
};

function cleanup() {
  exit = true;
  tauriWd?.kill();
  fakeServer?.kill();
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
