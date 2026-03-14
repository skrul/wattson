# Wattson - Peloton Ride Analyzer — Project Brief

## What We're Building

A free, open-source desktop application that lets Peloton subscribers sync their ride data, query it, and generate graphs. Think: "sort all my 30-minute rides by output," "graph my output over time," "show me cadence/heart rate/output for a specific ride."

The app is a Tauri desktop application. It runs on macOS, Windows, and Linux. It has no backend, no server, no database except a local SQLite file on the user's machine. It costs nothing to run and nothing to maintain. The GitHub repo and Cloudflare Pages (for a marketing/download page if needed) are the only infrastructure.

---

## Why Tauri

Several third-party Peloton analytics apps have come and gone. They fail because they require servers, which cost money and ops attention. The only sustainable model for a free open-source app is **fully local** — no backend, ever.

Tauri was chosen over alternatives (React web app, Chrome extension) for the following reasons:

- **CORS is not a problem.** HTTP requests in a Tauri app originate from Rust at the OS level, not from a browser sandbox. We can call `api.onepeloton.com` directly with no proxy, no Cloudflare Worker, no CORS configuration.
- **SQLite instead of IndexedDB.** Tauri's SQL plugin gives us a proper local relational database. Querying years of per-second ride metrics is fast and expressive. IndexedDB (the browser alternative) is awkward for complex queries.
- **Native filesystem.** Exporting graphs or CSVs writes directly to the user's Downloads folder. No download-prompt friction.
- **Cross-platform.** macOS, Windows, and Linux — all from one codebase.
- **Code signing is already handled.** The maintainer is an enrolled Apple Developer (notarization is free with the existing membership). Windows signing can be deferred initially since the target audience (Peloton data enthusiasts) can handle a SmartScreen "More info → Run anyway" prompt.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Tauri 2** | Rust core + WebView frontend |
| Frontend | **React 18 + TypeScript** | Large contributor pool, mature ecosystem |
| Build tool | **Vite** | Fast HMR, standard for React/TS |
| Charts | **Observable Plot** | Built by D3 team for exploratory data analysis. Handles scatter plots, time series, faceting with terse declarative syntax. Prefer over Recharts/Chart.js for this use case. |
| Styling | **Tailwind CSS** | Utility-first, easy for contributors to iterate on |
| State management | **Zustand** | Minimal boilerplate, easy to reason about |
| Local database | **SQLite via tauri-plugin-sql** | Local file only, never a remote DB |
| HTTP | **Tauri's native fetch / reqwest** | Rust-level HTTP, no CORS restrictions |
| Package manager | **pnpm** | Fast, disk-efficient |
| CI/CD + releases | **GitHub Actions + tauri-action** | Builds, signs, and notarizes for all platforms automatically |

---

## Data Sources

### 1. CSV Import (MVP, zero infrastructure required)

Peloton lets every user export their full workout history as a CSV from their profile settings. This is the primary data ingestion path for the MVP. Users drag and drop the CSV into the app.

The CSV contains summary data per workout: date, duration, output, calories, distance, heart rate averages, instructor, discipline, etc.

### 2. Live API Sync (secondary)

Peloton's unofficial REST API (`api.onepeloton.com`) is what their own web app uses. It is undocumented but stable and widely used by the third-party community.

- **Authentication:** Username + password POST to `/auth/login`, returns a `user_id` and session cookie. Store credentials in the system keychain via `tauri-plugin-stronghold` or equivalent — never plaintext.
- **Workout list:** `GET /api/user/{user_id}/workouts?limit=100&page=0`
- **Per-ride metrics:** `GET /api/workout/{workout_id}/performance_graph?every_n=1` — returns per-second time series for output, cadence, resistance, heart rate, speed. These are large; fetch on demand only.
- **Pagination:** Implement cursor/page-based pagination to sync full history on first launch, then incremental syncs thereafter.

---

## Database Schema

```sql
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,           -- Peloton workout ID
  peloton_id TEXT,               -- User's Peloton user ID
  date INTEGER,                  -- Unix timestamp
  duration_seconds INTEGER,
  discipline TEXT,               -- cycling, running, etc.
  title TEXT,
  instructor TEXT,
  output_watts REAL,
  calories REAL,
  distance REAL,
  avg_heart_rate REAL,
  avg_cadence REAL,
  avg_resistance REAL,
  avg_speed REAL,
  strive_score REAL,
  source TEXT                    -- 'csv' or 'api'
);

CREATE TABLE metrics (
  workout_id TEXT REFERENCES workouts(id),
  second INTEGER,
  output REAL,
  cadence REAL,
  resistance REAL,
  heart_rate REAL,
  speed REAL,
  PRIMARY KEY (workout_id, second)
);

-- Useful indexes
CREATE INDEX idx_workouts_date ON workouts(date);
CREATE INDEX idx_workouts_duration ON workouts(duration_seconds);
CREATE INDEX idx_metrics_workout ON metrics(workout_id);
```

---

## Core Features (MVP)

1. **CSV import** — drag and drop Peloton export CSV, parse and store in SQLite
2. **API sync** — authenticate with Peloton, sync workout history, incremental updates
3. **Workout list** — sortable/filterable table (by date, duration, output, instructor, discipline)
4. **Filtered views** — e.g., "show only 30-minute cycling rides, sorted by output descending"
5. **Output-over-time chart** — line/dot plot of output across all rides of a given duration
6. **Individual ride detail** — time series chart showing output, cadence, resistance, heart rate for a single ride
7. **Export** — save any chart as PNG or SVG to local filesystem

---

## Post-MVP Ideas

- Personal records / PRs by duration and discipline
- Instructor breakdown charts
- Week-over-week and month-over-month trends
- Comparison view (overlay multiple rides)
- Tauri 2 mobile support (iOS/Android) — architecture should not foreclose this

---

## Contributor Experience Goals

A new contributor should be able to get running with:

```bash
git clone <repo>
pnpm install
pnpm tauri dev
```

Plus: Rust toolchain (rustup), platform-specific WebKit deps on Linux. Document these clearly in CONTRIBUTING.md. The Rust layer should be kept as thin as possible — HTTP, SQLite, file I/O — so most contributors can work entirely in the TypeScript/React layer.

---

## What This App Is Not

- It does not store user data anywhere except the user's own machine
- It does not have user accounts
- It does not have a server, API, or cloud sync
- It does not cost anything to use, run, or maintain
- It is not a Peloton competitor — it is a read-only analysis tool

---

## Key Decisions to Preserve

- **No backend, ever.** If a feature requires a server, reconsider the feature.
- **Observable Plot, not Recharts or Chart.js.** The declarative grammar is worth the learning curve for a data analysis app.
- **SQLite, not IndexedDB or JSON files.** The relational model and query performance matter at scale.
- **Tauri's Rust HTTP, not a JavaScript fetch polyfill.** Keeps CORS out of the picture permanently.
- **pnpm, not npm or yarn.** Faster, disk-efficient, better monorepo support if the project grows.
