import { execSync } from "child_process";
import readline from "readline";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const screenshotDir = path.join(projectRoot, "screenshots");
const swiftScript = path.resolve(__dirname, "..", "..", "find-window-id.swift");

// Ensure screenshots directory exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

/**
 * Capture a screenshot of the Wattson window using macOS native screencapture.
 * This avoids the CSS-less rendering issue with tauri-wd's saveScreenshot().
 */
function captureScreenshot(name) {
  const windowId = execSync(`swift "${swiftScript}" wattson`).toString().trim();
  if (!windowId) throw new Error("Could not find Wattson window ID");
  const outputPath = path.join(screenshotDir, `${name}.png`);
  execSync(`screencapture -l ${windowId} -o -x "${outputPath}"`);
  console.log(`    Saved: screenshots/${name}.png`);
}

/** Wait for an element matching the selector to exist in the DOM. */
async function waitFor(selector, timeout = 10_000) {
  const el = await $(selector);
  await el.waitForExist({ timeout });
  return el;
}

/** Prompt the user and wait for Enter. Opens /dev/tty directly to bypass wdio's stdio piping. */
function prompt(message) {
  return new Promise((resolve) => {
    const ttyIn = fs.createReadStream("/dev/tty");
    const ttyOut = fs.createWriteStream("/dev/tty");
    const rl = readline.createInterface({
      input: ttyIn,
      output: ttyOut,
    });
    rl.question(message, () => {
      rl.close();
      ttyIn.destroy();
      ttyOut.destroy();
      resolve();
    });
  });
}

const SCREENSHOTS = ["home", "workouts", "filter", "compare", "insights", "studio"];

describe("Screenshot capture", () => {
  before(async () => {
    // Wait for main app to load (must not be the setup wizard)
    await waitFor("h1=Wattson", 30_000);

    // Resize window: 1312x940 outer -> ~2624x1824 screenshot at 2x Retina
    try {
      await browser.setWindowSize(1312, 940);
    } catch {
      // tauri-wd may not support setWindowSize -- fall back to Tauri API
      await browser.execute(async () => {
        const { getCurrentWindow } = window.__TAURI__.window;
        await getCurrentWindow().setSize({ type: "Logical", width: 1312, height: 940 });
      });
    }
    await browser.pause(2000);

    console.log("\n  Window sized to 1312x940. Set up each screen and press Enter to capture.\n");
  });

  for (const name of SCREENSHOTS) {
    it(name, async () => {
      await prompt(`  [${name}] Set up the screen, then press Enter to capture... `);
      captureScreenshot(name);
    });
  }
});
