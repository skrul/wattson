# Project Guidelines

## Git Branching

- All new work must go on a feature branch — never commit directly to `main`.
- Always branch from the latest `main`: `git checkout -b feature/<name> main`.
- Merge feature branches back into `main` when complete.

## Git Worktree Rules

When working inside a git worktree (`.claude/worktrees/`), follow these rules strictly:

1. **Never `cd` to the main worktree.** Every git command must run from the worktree directory. The shell working directory must always be inside the worktree (e.g. `.claude/worktrees/<name>/`).
2. **Create branches in the worktree:** `git checkout -b <name> <base-ref>` — this creates a new branch from any ref and checks it out in the current worktree without touching the main worktree.
3. **Merge into main:** Use `git -C <main-worktree-path> merge <branch>` — this runs the merge in the main worktree without changing our shell directory.
4. **Verify before merging:** Before any `git -C <main-worktree-path> merge`, run `git -C <main-worktree-path> rev-parse --abbrev-ref HEAD` and confirm it returns `main`. If it doesn't, stop and alert the user — merging will land on the wrong branch.
5. **Never check out `main` in the worktree** — it's already checked out in the main worktree and git will refuse.
6. **Never switch branches in the main worktree** — it should always stay on `main`.

## Database Schema & Migrations

The app has not yet been released, so destructive schema changes (drop + recreate) are acceptable for now. **Once the app is released**, any data or schema changes must:

1. Be versioned — add a new `Migration` entry in `src-tauri/src/lib.rs` with an incremented version number.
2. Include a migration path — use `ALTER TABLE`, data backfills, etc. so existing user data is preserved.
3. Never drop or recreate tables that contain user data.

## UI Patterns & Gotchas

### Popover/dropdown dismissal inside modals

Dropdowns inside scrollable modals (`overflow-y-auto`) have two recurring issues:

1. **Overflow clipping** — Absolutely positioned dropdowns get clipped by the modal's `overflow-y-auto`. Fix: render the dropdown via `createPortal(…, document.body)` and position with `getBoundingClientRect()` + scroll/resize listeners.

2. **Click-outside dismissal** — Headless UI `PopoverButton` can intercept events and prevent manual click-outside handlers from firing. Fix: use `pointerdown` in the **capture phase** (`addEventListener("pointerdown", handler, true)`) so the handler fires before Headless UI can stop propagation.

See `ChartFilterBar.tsx` `FilterChip` for the reference implementation combining both fixes.

## E2E Testing (WebdriverIO + tauri-wd)

Tests live in `test-server/test/specs/`. Run with `npx wdio run wdio.conf.js --spec test/specs/<file>` from the `test-server/` directory.

### Tauri native dialogs can't be automated

`confirm()` from `@tauri-apps/plugin-dialog` opens an OS-level dialog that WebDriver cannot interact with. **Always use `src/lib/confirm.ts`** (our wrapper) instead of importing directly from the plugin. The wrapper checks `window.__WATTSON_SKIP_CONFIRM__` and auto-confirms in test mode. Tests set this flag in their `before` hook (and after any `location.reload()`).

### CSS `text-transform` affects `innerText`

`waitForText()` checks `document.body.innerText`, which reflects CSS transforms. If an element has `uppercase`, you must match the uppercase text (e.g. `waitForText("TEST SECTION")` not `waitForText("Test Section")`). `textContent` is unaffected but `innerText` is what the user sees.

### All dashboard tabs stay mounted with `visibility: hidden`

`App.tsx` keeps inactive dashboard tabs in the DOM with `visibility: hidden`. Element selectors like `$("span=Total Workouts")` will match elements on hidden tabs. **Always scope selectors** — use `$('[role="dialog"]').$('span=...')` for modals, or filter with `getComputedStyle(el).visibility !== "hidden"` in `browser.execute`.

### tauri-wd + React controlled inputs

WDIO's `setValue()` doesn't reliably trigger React's synthetic change events through tauri-wd. For controlled inputs, use `browser.execute` to call `input.__reactProps$.onChange({ target: { value: "..." } })` directly.

## Architecture Docs

- **[Sync & Enrichment](docs/SYNC.md)** — Data flow from Peloton API through sync, enrichment backfill, and on-demand loading. Covers the state machine, store↔DB data gap, and key invariants.
- **[State Machine Style Guide](docs/STATE_MACHINES.md)** — Conventions for authoring XState v5 machines: file structure, config/companion split, descriptions, error handling, and visualization.
