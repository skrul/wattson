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
  await waitFor("h2=Welcome to Wattson", 10_000);

  const emailInput = await waitFor('input[placeholder="Peloton email"]');
  await emailInput.setValue(TEST_EMAIL);

  const passwordInput = await $('input[placeholder="Password"]');
  await passwordInput.setValue(TEST_PASSWORD);

  const signInBtn = await $("button=Sign In");
  await signInBtn.click();

  await waitFor("h2=You're All Set!", 30_000);

  const getStartedBtn = await $("button=Get Started");
  await getStartedBtn.click();

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
 * Helper: wait for text to disappear from the page.
 */
async function waitForTextGone(text, timeout = 10_000) {
  await browser.waitUntil(
    async () => {
      return browser.execute((t) => {
        return !(document.body?.innerText?.includes(t) ?? false);
      }, text);
    },
    { timeout, timeoutMsg: `Page still contained "${text}" after ${timeout}ms` },
  );
}

/** Helper: click a button by its text content using JS (reliable in tauri-wd). */
async function clickButton(text) {
  const clicked = await browser.execute((t) => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === t) {
        btn.click();
        return true;
      }
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Button "${text}" not found`);
}

/** Helper: click a button whose text content includes the given substring. */
async function clickButtonContaining(text) {
  const clicked = await browser.execute((t) => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.includes(t)) {
        btn.click();
        return true;
      }
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Button containing "${text}" not found`);
}

/** Helper: count widgets currently visible in the dashboard grid. */
async function countWidgets() {
  return browser.execute(() => {
    // Widgets are rendered inside the react-grid-layout container.
    // Each widget is a direct child div of the GridLayout.
    // Look for WidgetWrapper's signature class pattern.
    return document.querySelectorAll(".group.relative.h-full.select-none").length;
  });
}

/** Helper: click a widget's remove button by finding the X icon button. */
async function clickRemoveOnWidget() {
  await browser.execute(() => {
    const btn = document.querySelector('button[title="Remove"]');
    if (btn) btn.click();
  });
}

describe("Dashboard editing", () => {
  // ---------------------------------------------------------------
  // Setup: login and wait for initial sync
  // ---------------------------------------------------------------
  before(async () => {
    await adminCall("/admin/reset", "POST", { count: 5 });
    await loginViaWizard();
    // Wait for enrichment to complete so dashboard widgets can render
    await browser.pause(2000);
  });

  // ---------------------------------------------------------------
  // Scenario 1: Add a new dashboard via Manage Dashboards modal
  // ---------------------------------------------------------------
  describe("Scenario 1: Create a new dashboard", () => {
    it("should enter edit mode on the Home dashboard", async () => {
      // Make sure we're on a dashboard tab (Home is the default first tab)
      await clickButton("Edit");
      await waitForText("Done");
    });

    it("should open Manage Dashboards and add a new dashboard", async () => {
      await clickButton("Manage Dashboards");
      await waitForText("Manage Dashboards");

      // Click "+ Add Dashboard"
      await clickButtonContaining("Add Dashboard");
      await browser.pause(300);

      // Verify the new dashboard appears in the list
      await waitForText("New Dashboard");

      // Close the modal
      await clickButton("Done");
      await browser.pause(300);
    });

    it("should switch to the new dashboard tab", async () => {
      // Exit edit mode on Home first
      await clickButton("Done");
      await browser.pause(300);

      // Click the new dashboard tab
      await clickButton("New Dashboard");
      await browser.pause(500);

      // The new dashboard should be empty
      await waitForText("Your dashboard is empty");
    });
  });

  // ---------------------------------------------------------------
  // Scenario 1b: Rename the new dashboard
  // ---------------------------------------------------------------
  describe("Scenario 1b: Rename a dashboard", () => {
    it("should open Manage Dashboards and click the dashboard name to edit", async () => {
      await clickButton("Edit");
      await waitForText("Done");

      await clickButton("Manage Dashboards");
      await waitForText("Manage Dashboards");

      // Click the "New Dashboard" name to start editing
      // The name is rendered as a button inside the modal
      await browser.execute(() => {
        const buttons = document.querySelectorAll("button");
        for (const btn of buttons) {
          if (btn.textContent.trim() === "New Dashboard" && btn.closest(".flex.items-center.gap-2")) {
            btn.click();
            return;
          }
        }
      });
      await browser.pause(300);
    });

    it("should type a new multi-character name", async () => {
      // An input should now be visible with the current name selected
      const input = await waitFor('input[type="text"]');
      // Type the new name — if select-on-focus is broken, only the last
      // character would remain, so we use a distinctive multi-char name
      await input.setValue("My Test Dashboard");
      await browser.pause(200);

      // Press Enter to commit
      await browser.keys("Enter");
      await browser.pause(300);
    });

    it("should show the renamed dashboard in the modal and tab bar", async () => {
      // Verify the new name appears in the Manage Dashboards list
      await waitForText("My Test Dashboard");

      // Close the modal
      await clickButton("Done");
      await browser.pause(300);

      // Exit edit mode
      await clickButton("Done");
      await browser.pause(300);

      // The tab bar should show the renamed dashboard
      await waitForText("My Test Dashboard");

      // Switch to it to confirm it works
      await clickButton("My Test Dashboard");
      await browser.pause(500);

      await waitForText("Your dashboard is empty");
    });
  });

  // ---------------------------------------------------------------
  // Scenario 2: Add a widget to the new dashboard
  // ---------------------------------------------------------------
  describe("Scenario 2: Add a widget", () => {
    it("should add a section widget via the empty state button", async () => {
      // Click "Add your first widget" button on the empty dashboard
      await clickButtonContaining("Add your first widget");
      await browser.pause(500);

      // Widget gallery modal should open
      await waitForText("Widget Types");
    });

    it("should select Section type and add via Custom", async () => {
      // Click "Section" in the type list
      await clickButton("Section");
      await browser.pause(300);

      // Click "Custom" (only option for sections since there are no presets)
      await clickButton("Custom");
      await browser.pause(300);

      // Section config modal should appear with title input
      await waitForText("Add Section Widget");

      // Type a title
      const input = await waitFor('input[placeholder="Section"]');
      await input.setValue("Test Section");

      // Click "Add Widget"
      await clickButton("Add Widget");
      await browser.pause(500);
    });

    it("should show the section widget in the dashboard", async () => {
      await waitForText("Test Section");
      const count = await countWidgets();
      expect(count).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Scenario 3: Add a metric widget via preset
  // ---------------------------------------------------------------
  describe("Scenario 3: Add a preset widget", () => {
    it("should enter edit mode and open Add Widget gallery", async () => {
      await clickButton("Edit");
      await waitForText("Done");

      await clickButton("Add Widget");
      await browser.pause(500);

      await waitForText("Widget Types");
    });

    it("should add a Metric Total preset", async () => {
      // Metric Total should be selected by default
      await waitForText("Metric Total");

      // Click the first preset (e.g., "Total Workouts")
      await clickButton("Total Workouts");
      await browser.pause(500);
    });

    it("should now have 2 widgets", async () => {
      const count = await countWidgets();
      expect(count).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // Scenario 3b: Build a complex layout and verify order survives refresh
  //
  // Regression test: adding a widget to a dashboard with many existing
  // widgets used to cause the new widget to jump to the top after
  // refresh, due to y: Infinity not surviving JSON serialization and
  // a race between two fire-and-forget persist calls.
  // ---------------------------------------------------------------
  describe("Scenario 3b: Widget order persists after refresh (complex layout)", () => {
    it("should add more widgets to create a complex layout", async () => {
      // Currently have: section + metric total (2 widgets) in edit mode
      // Add 2 more widgets to build a denser layout

      // Add another metric preset
      await clickButton("Add Widget");
      await browser.pause(500);
      await waitForText("Widget Types");
      await clickButton("Total Calories");
      await browser.pause(500);

      // Add an Activity Grid preset
      await clickButton("Add Widget");
      await browser.pause(500);
      await waitForText("Widget Types");
      await clickButton("Activity Grid");
      await browser.pause(300);
      // Activity Grid has presets — click the first one
      await clickButton("Workout Count");
      await browser.pause(500);

      const count = await countWidgets();
      expect(count).toBe(4);
    });

    it("should add one more widget at the bottom", async () => {
      // This is the widget we'll verify stays at the bottom after refresh
      await clickButton("Add Widget");
      await browser.pause(500);
      await waitForText("Widget Types");
      await clickButton("Section");
      await browser.pause(300);
      await clickButton("Custom");
      await browser.pause(300);
      await waitForText("Add Section Widget");
      const input = await waitFor('input[placeholder="Section"]');
      await input.setValue("Bottom Section");
      await clickButton("Add Widget");
      await browser.pause(500);

      const count = await countWidgets();
      expect(count).toBe(5);
    });

    it("should exit edit mode and record widget positions", async () => {
      await clickButton("Done");
      await browser.pause(500);

      const order = await browser.execute(() => {
        const items = document.querySelectorAll(".group.relative.h-full.select-none");
        return Array.from(items).map((el) => {
          const rect = el.getBoundingClientRect();
          return { y: rect.top, text: el.textContent.substring(0, 50) };
        }).sort((a, b) => a.y - b.y);
      });

      expect(order.length).toBe(5);

      // "Bottom Section" should be the last widget (highest y)
      const bottomWidget = order[order.length - 1];
      expect(bottomWidget.text).toContain("Bottom Section");
    });

    it("should preserve widget order after page refresh", async () => {
      await browser.execute(() => location.reload());
      await browser.pause(2000);

      await waitFor("h1=Wattson", 10_000);
      await clickButton("My Test Dashboard");
      await browser.pause(1000);

      const orderAfter = await browser.execute(() => {
        const items = document.querySelectorAll(".group.relative.h-full.select-none");
        return Array.from(items).map((el) => {
          const rect = el.getBoundingClientRect();
          return { y: rect.top, text: el.textContent.substring(0, 50) };
        }).sort((a, b) => a.y - b.y);
      });

      // Should still have 5 widgets
      expect(orderAfter.length).toBe(5);

      // "Bottom Section" must still be the last widget — not jumped to top
      const bottomWidget = orderAfter[orderAfter.length - 1];
      expect(bottomWidget.text).toContain("Bottom Section");

      // Enter edit mode for subsequent scenarios
      await clickButton("Edit");
      await waitForText("Done");
    });
  });

  // ---------------------------------------------------------------
  // Scenario 4: Delete a widget in edit mode
  // ---------------------------------------------------------------
  describe("Scenario 4: Delete widgets", () => {
    it("should still be in edit mode with 5 widgets", async () => {
      await waitForText("Done");
      const count = await countWidgets();
      expect(count).toBe(5);
    });

    it("should delete widgets one by one", async () => {
      // Override window.confirm to always return true (it's unreliable in Tauri webviews)
      await browser.execute(() => {
        window._origConfirm = window.confirm;
        window.confirm = () => true;
      });

      // Remove all 5 widgets
      for (let i = 5; i > 0; i--) {
        await clickRemoveOnWidget();
        await browser.pause(500);
        const count = await countWidgets();
        expect(count).toBe(i - 1);
      }

      // Restore original confirm
      await browser.execute(() => {
        if (window._origConfirm) {
          window.confirm = window._origConfirm;
          delete window._origConfirm;
        }
      });
    });
  });

  // ---------------------------------------------------------------
  // Scenario 5: Verify empty state after all widgets deleted
  // ---------------------------------------------------------------
  describe("Scenario 5: Empty state after deleting all widgets", () => {

    it("should show empty state after exiting edit mode", async () => {
      await clickButton("Done");
      await browser.pause(300);

      await waitForText("Your dashboard is empty");
    });
  });

  // ---------------------------------------------------------------
  // Scenario 6: Clean up — delete the test dashboard
  // ---------------------------------------------------------------
  describe("Scenario 6: Delete the test dashboard", () => {
    it("should switch to Home and delete the test dashboard via Manage Dashboards", async () => {
      await clickButton("Home");
      await browser.pause(300);

      await clickButton("Edit");
      await browser.pause(300);

      await clickButton("Manage Dashboards");
      await waitForText("Manage Dashboards");

      // Find and click the delete button for "My Test Dashboard" (not the first dashboard)
      const deleted = await browser.execute(() => {
        // Each dashboard row has a delete button (trash icon) as the last button
        // The first dashboard's delete is disabled, so we look for enabled ones
        const rows = document.querySelectorAll('button[title="Delete dashboard"]');
        for (const btn of rows) {
          if (!btn.disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      expect(deleted).toBe(true);
      await browser.pause(500);

      // Verify "My Test Dashboard" is no longer in the list
      await waitForTextGone("My Test Dashboard");

      await clickButton("Done");
      await browser.pause(300);
    });
  });
});
