const FAKE_SERVER = "http://localhost:3001";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "testpassword";

/** Helper: call fake server admin API. */
async function adminCall(path, method = "POST", body = undefined) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${FAKE_SERVER}${path}`, opts);
  return res.json();
}

/**
 * Helper: wait until an element matching the selector exists in the DOM.
 * Uses native findElement (no executeScript), avoiding tauri-wd compatibility issues.
 */
async function waitFor(selector, timeout = 10_000) {
  const el = await $(selector);
  await el.waitForExist({ timeout });
  return el;
}

/** Helper: wait for the setup wizard dialog and fill in credentials. */
async function loginViaWizard() {
  // Wait for the wizard dialog's heading
  await waitFor("h2=Welcome to Wattson", 10_000);

  const emailInput = await waitFor('input[placeholder="Peloton email"]');
  await emailInput.setValue(TEST_EMAIL);

  const passwordInput = await $('input[placeholder="Password"]');
  await passwordInput.setValue(TEST_PASSWORD);

  const signInBtn = await $("button=Sign In");
  await signInBtn.click();

  // Wait for sync + success
  await waitFor("h2=You're All Set!", 30_000);

  // Dismiss the wizard
  const getStartedBtn = await $("button=Get Started");
  await getStartedBtn.click();

  // Wait for main app
  await waitFor("h1=Wattson", 5_000);
}

/**
 * Helper: wait for text to appear on the page via JS execution.
 * Avoids element reference issues with tauri-wd.
 */
async function waitForText(text, timeout = 15_000) {
  await browser.waitUntil(
    async () => {
      return browser.execute((t) => {
        return document.body?.innerText?.includes(t) ?? false;
      }, text);
    },
    { timeout, timeoutMsg: `Page did not contain "${text}" within ${timeout}ms` },
  );
}

/**
 * Helper: verify enrichment data is reflected in the workout UI.
 * Clicks a cycling workout card, checks the summary chart and stats tab values.
 */
async function verifyEnrichmentInUI() {
  // First click a strength workout to deselect any cycling workout,
  // then click a cycling workout — this forces a fresh detail load.
  await browser.execute(() => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.includes("Strength")) {
        btn.click();
        return;
      }
    }
  });
  await browser.pause(300);

  await browser.execute(() => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.includes("Ride") && !btn.classList.contains("bg-gray-800")) {
        btn.click();
        return;
      }
    }
  });
  await browser.pause(500);

  // 1. Summary tab: verify the workout detail and shareable chart rendered
  await waitForText("Duration:", 5_000);
  await waitForText("Shareable Chart", 5_000);

  // 2. Click the Stats tab
  await browser.execute(() => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === "Stats") {
        btn.click();
        return;
      }
    }
  });
  await browser.pause(300);

  // 3. Verify stats show enriched numeric values (not "—" placeholders)
  const statsCheck = await browser.execute(() => {
    const text = document.body.innerText;

    // Check that specific stats have numeric values
    // The Stat component renders: value on one line, "Label (unit)" on the next
    const caloriesMatch = text.match(/(\d+)\s*\n\s*Calories \(kcal\)/);
    const hrMatch = text.match(/(\d+)\s*\n\s*Avg Heart Rate \(bpm\)/);
    const outputMatch = text.match(/(\d+)\s*\n\s*Avg Output \(watts\)/);

    // Verify no loading skeletons remain
    const skeletons = document.querySelectorAll(".animate-pulse");

    return {
      calories: caloriesMatch ? parseInt(caloriesMatch[1]) : null,
      avgHeartRate: hrMatch ? parseInt(hrMatch[1]) : null,
      avgOutput: outputMatch ? parseInt(outputMatch[1]) : null,
      loadingSkeletons: skeletons.length,
    };
  });

  expect(statsCheck.loadingSkeletons).toBe(0);
  expect(statsCheck.calories).toBeGreaterThan(0);
  expect(statsCheck.avgHeartRate).toBeGreaterThan(0);
  expect(statsCheck.avgOutput).toBeGreaterThan(0);

  // 4. Verify workout cards in the list show metric values (kj for default sort)
  const hasCardMetrics = await browser.execute(() => {
    const els = document.querySelectorAll("div");
    for (const el of els) {
      if (el.textContent.trim() === "kj") return true;
    }
    return false;
  });
  expect(hasCardMetrics).toBe(true);

  // Switch back to Summary tab for clean state
  await browser.execute(() => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === "Summary") {
        btn.click();
        return;
      }
    }
  });
}

/** Helper: open the account popover. Handles toggle by checking current state. */
async function openAccountPopover() {
  // Check if popover is already open (Reset Workouts button visible)
  const alreadyOpen = await browser.execute(() => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === "Reset Workouts") return true;
    }
    return false;
  });

  if (!alreadyOpen) {
    const accountBtn = await waitFor('button[title="Account"]', 5_000);
    await accountBtn.click();
    await browser.pause(500);
  }
}

/** Helper: close the account popover by clicking the PopoverButton to toggle it closed. */
async function closeAccountPopover() {
  const accountBtn = await $('button[title="Account"]');
  await accountBtn.click();
  await browser.pause(300);
}

describe("Sync lifecycle", () => {
  // ---------------------------------------------------------------
  // Scenario 1: First-time start with fresh DB
  // ---------------------------------------------------------------
  describe("Scenario 1: First-time setup (250 workouts, 3 pages)", () => {
    it("should reset fake server to 250 workouts", async () => {
      await adminCall("/admin/reset", "POST", { count: 250 });
      await adminCall("/admin/clear-log");
    });

    it("should complete login via setup wizard", async () => {
      await loginViaWizard();
    });

    it("should show correct workout count immediately after sync", async () => {
      // This catches the "0 workouts" regression — count must update right after sync,
      // before enrichment has time to process anything.
      await openAccountPopover();
      await waitForText("250 workouts", 5_000);
    });

    it("should complete enrichment", async () => {
      await waitForText("All details downloaded", 60_000);
    });

    it("should show enriched data in workout detail", async () => {
      await closeAccountPopover();
      await verifyEnrichmentInUI();
    });

    it("should have paginated the workout fetch", async () => {
      const log = await adminCall("/admin/call-log", "GET");
      const paths = log.map((e) => e.path);

      expect(paths).toContain("/oauth/token");
      expect(paths).toContain("/api/me");

      // With 250 workouts and PAGE_SIZE=100, expect 3 workout list requests
      const workoutListCalls = paths.filter((p) => p.includes("/workouts") && !p.includes("workout/"));
      expect(workoutListCalls.length).toBe(3);

      const perfGraphCalls = paths.filter((p) => p.includes("/performance_graph"));
      expect(perfGraphCalls.length).toBeGreaterThanOrEqual(250);

      await closeAccountPopover();
    });
  });

  // ---------------------------------------------------------------
  // Scenario 2: Incremental sync
  // ---------------------------------------------------------------
  describe("Scenario 2: Incremental sync", () => {
    it("should add 2 workouts and clear call log", async () => {
      await adminCall("/admin/add-workouts", "POST", { count: 2 });
      await adminCall("/admin/clear-log");
    });

    it("should trigger sync and see 252 workouts", async () => {
      const syncBtn = await waitFor('button[title="Sync workouts"]', 5_000);
      await syncBtn.click();

      // Wait for sync to complete — check via JS
      await browser.pause(500);
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            const svgs = document.querySelectorAll("svg");
            for (const svg of svgs) {
              if (svg.classList.contains("animate-spin")) return false;
            }
            return true;
          });
        },
        { timeout: 30_000, timeoutMsg: "Sync did not complete" },
      );

      await openAccountPopover();
      await waitForText("252 workouts", 10_000);
      await waitForText("All details downloaded", 30_000);
    });

    it("should show enriched data in workout detail after incremental sync", async () => {
      await closeAccountPopover();
      await verifyEnrichmentInUI();
    });

    it("should only have fetched the 2 new workouts for enrichment", async () => {
      const log = await adminCall("/admin/call-log", "GET");
      const paths = log.map((e) => e.path);

      expect(paths.some((p) => p.includes("/workouts"))).toBe(true);

      const perfGraphCalls = paths.filter((p) => p.includes("/performance_graph"));
      expect(perfGraphCalls.length).toBe(2);

      await closeAccountPopover();
    });
  });

  // ---------------------------------------------------------------
  // Scenario 3: Reset and re-sync (race condition regression test)
  // ---------------------------------------------------------------
  describe("Scenario 3: Reset and re-sync", () => {
    it("should reset via UI", async () => {
      await adminCall("/admin/reset", "POST", { count: 5 });
      await adminCall("/admin/clear-log");

      await openAccountPopover();

      const resetBtn = await waitFor("button=Reset Workouts", 5_000);
      await resetBtn.click();

      // Confirm via JS click to avoid stale element issues in the dialog
      await browser.pause(500);
      await browser.execute(() => {
        const buttons = document.querySelectorAll("button");
        for (const btn of buttons) {
          if (btn.classList.contains("bg-red-600") && btn.textContent.includes("Reset")) {
            btn.click();
            return;
          }
        }
      });

      await browser.pause(500);
    });

    it("should complete login again via setup wizard", async () => {
      await loginViaWizard();
    });

    it("should show 5 workouts and complete enrichment after reset", async () => {
      await openAccountPopover();
      await waitForText("5 workouts", 10_000);
      await waitForText("All details downloaded", 30_000);
    });

    it("should show enriched data in workout detail after reset", async () => {
      await closeAccountPopover();
      await verifyEnrichmentInUI();
    });
  });
});
