# Sync & Enrichment Architecture

## 1. System Overview

Three subsystems keep workout data flowing from the Peloton API into the UI:

1. **Workout Sync** (`sync.ts`) — Bulk-fetches the workout list, inserts new workouts into the DB, and does a quick inline enrichment pass (all 3 detail endpoints) on incremental syncs.
2. **Enrichment Backfill** (`enrichmentStore.ts`) — Background loop that fills in the remaining detail for every workout: workout detail, performance graph, and ride details. Rate-limited, cache-aware, and pausable.
3. **On-Demand Loading** (`WorkoutDetail.tsx`) — When a user selects a workout, loads enrichment data from the DB first, then falls back to the API if the DB is also missing it.

## 2. Data Flow

```
Peloton API ──→ sync.ts ──→ database (INSERT OR REPLACE) ──→ workoutStore (queryWorkouts) ──→ UI
                  │                             ↑
                  │         enrichmentStore ────┘  (backfill loop: detail + perf + ride)
                  │         enrichmentCache ────┘  (HTTP response cache layer)
                  │
                  └──→ inline enrichment (incremental syncs: detail + perf + ride)

WorkoutDetail ──→ getWorkoutById (DB) ──→ API fallback (via enrichmentCache)
```

## 3. Workout Sync (`sync.ts`)

### Entry points

| Trigger | Location |
|---------|----------|
| Auto-sync on launch | `App.tsx:79` — runs after profile is loaded, guarded by `autoSyncOnLaunch` pref |
| Manual sync button | `App.tsx:161` — header refresh icon |
| Setup wizard | `SetupWizard.tsx:59` — `startSync()` (inline fetch, not via `syncWorkouts()`) |
| ApiSync page | `ApiSync.tsx:83` — calls `syncWorkouts()` |

### Phases

1. **Early-stop check**: Compare `existingIds.size` against `userProfile.total_workouts`. If DB count >= profile total, pass `existingIds` to `fetchAllWorkouts` so it can stop early when a page of already-known IDs is encountered.
2. **Fetch pages**: `fetchAllWorkouts()` paginates through the Peloton API.
3. **Insert to DB**: New workouts (not in `existingIds`) are inserted via `insertWorkouts()` (`INSERT OR REPLACE`).
4. **Re-query store**: `queryWorkouts(filters)` → `setWorkouts()` → `notifySync()` bumps `syncGeneration`.
5. **Inline enrichment** (incremental syncs only): For each new workout, fetches all 3 endpoints in parallel (performance graph, workout detail, ride details) and writes results to the DB via `updateWorkoutMetrics()` + `updateRideDetails()`. Only runs when `isComplete` is true (DB already has all workouts, so new ones are recent additions). On initial/full syncs, the backfill loop handles enrichment instead. Non-fatal — backfill retries later.
6. **Profile fetch**: Fetches and caches the user profile (non-fatal).
7. **Kick off backfill**: `ensureRunning()` starts the enrichment loop if it isn't already running or complete.

### Auth retry flow

```
AuthError → silent re-login (stored credentials)
         → if that fails → reauth modal (user re-enters password)
         → retry the fetch
```

## 4. Enrichment Backfill (`enrichmentStore.ts`)

### State machine

```
                startBackfill()
  ┌─────────┐  ensureRunning()   ┌─────────┐  loop done    ┌──────────┐
  │  paused  │ ────────────────→ │ running  │ ────────────→ │ complete │
  └─────────┘                    └─────────┘                └──────────┘
       ↑                              │                          │
       │     pauseBackfill()          │    new workouts synced   │
       │     auth error               │    (refreshCounts sees   │
       │     no session               │     unenriched → resets) │
       └──────────────────────────────┘                          │
       ↑                                                         │
       └─────────────────────────────────────────────────────────┘
```

- **paused → running**: `startBackfill()` or `ensureRunning()` (only if not already running/complete)
- **running → complete**: `getUnenrichedWorkouts()` returns nothing left to process
- **running → paused**: `pauseBackfill()` sets abort flag, or auth error, or no session
- **complete → paused**: `refreshCounts()` detects unenriched workouts (new sync happened), resets status

### Per-workout loop

1. Call `getUnenrichedWorkouts()` — returns workouts missing any of the 3 `*_fetched_at` timestamps, ordered by date DESC.
2. Skip any `workoutId` in `skippedIds` (failed this session).
3. Fetch 3 endpoints in parallel via enrichment cache:
   - `cachedFetchPerformanceGraph(workoutId, token)`
   - `cachedFetchWorkoutDetail(workoutId, token)` (catch → null)
   - `cachedFetchRideDetails(rideId, token)` (catch → null, skipped if no valid rideId)
4. Write results to DB: `updateWorkoutMetrics()` + `updateRideDetails()`.
5. If detail or ride fetch failed, add `workoutId` to `skippedIds` (retried on next app launch).
6. `refreshCounts()` updates progress in the store.
7. **Rate limiting**: 2-second delay between workouts, **skipped** if all 3 fetches were cache hits.

### On completion

When the loop finishes and `enrichmentComplete` is true, bumps `syncGeneration` so dashboard widgets refetch with fully enriched data.

### Error handling

- **AuthError**: pauses the loop so the user can re-authenticate.
- **Other errors**: adds workout to `skippedIds`, continues to next workout.
- `skippedIds` is cleared on `reset()` (called on sign-out / data reset).

## 5. On-Demand Loading (`WorkoutDetail.tsx`)

Two sequential effects run when a workout is selected:

### Effect 1: DB-first load (line 140)

If the store workout is missing `raw_performance_graph_json` or `raw_ride_details_json`, calls `getWorkoutById()` to load the full row from the DB (which includes the large JSON columns that `queryWorkouts` omits). Patches the store via `updateWorkout()`.

### Effect 2: API fallback (line 165)

If the workout still lacks metrics (`calories == null` or `raw_performance_graph_json == null`) or ride details, fetches from the API via the enrichment cache functions. Writes results to both DB and store. Also extracts ride ID from `raw_json` for the ride details fetch.

## 6. Store ↔ DB Data Gap

`queryWorkouts()` intentionally omits 3 large JSON columns for performance:

- `raw_detail_json`
- `raw_performance_graph_json`
- `raw_ride_details_json`

This means workouts in the store are "partial" — they have scalar metrics but not the raw JSON needed for charts and comparisons.

### Mitigations

| Component | Strategy |
|-----------|----------|
| **WorkoutList** (line 47) | On re-query, preserves `raw_*` fields from old store entries so previously-viewed workouts don't lose their enrichment data. |
| **WorkoutDetail** (line 140) | Loads full row from DB on select, then falls back to API. |
| **CompareTab** (line 177) | Receives workouts from `getWorkoutsByRideId()` (full `SELECT *`), merges with store data to get the freshest scalar metrics while keeping raw JSON. |

## 7. Enrichment Cache (`enrichmentCache.ts`)

Separate SQLite database (`enrichment_cache.db`) with a single `cache` table:

```
key TEXT PRIMARY KEY  →  raw_json TEXT NOT NULL
```

Key format:
- `perf:{workoutId}` — performance graph response
- `detail:{workoutId}` — workout detail response
- `ride:{rideId}` — ride details response (keyed by ride, not workout)

**Survives data resets** — `deleteAllData()` only clears the main DB. The cache has a separate `clearCache()` function.

Used by both the backfill loop and on-demand loading, preventing duplicate API calls.

## 8. Key Invariants

- **"Enriched" definition**: A workout is fully enriched only when all 3 timestamps are non-null: `detail_fetched_at`, `perf_graph_fetched_at`, `ride_details_fetched_at`.
- **Idempotent inserts**: `INSERT OR REPLACE` on both workouts and cache entries makes re-syncing safe.
- **`syncGeneration`**: Only bumped by explicit `notifySync()` calls (after new workout insert) or when enrichment backfill completes with `enrichmentComplete = true`. Dashboard widgets and other consumers use this as a signal to refetch.
- **Cache immutability**: The enrichment cache is never invalidated — Peloton API data is immutable per workout/ride, so cached responses are always valid.
- **`skippedIds` scope**: Session-local only (module-level `Set`), cleared on `reset()` or app restart. Prevents the backfill loop from getting stuck on a permanently-failing workout.

## Files Referenced

| Subsystem | File |
|-----------|------|
| Sync core | `src/lib/sync.ts` |
| Session state | `src/stores/sessionStore.ts` |
| Enrichment backfill | `src/stores/enrichmentStore.ts` |
| Enrichment cache | `src/lib/enrichmentCache.ts` |
| DB operations | `src/lib/database.ts` |
| Workout store | `src/stores/workoutStore.ts` |
| On-demand loading | `src/components/WorkoutDetail.tsx` |
| Workout list (data preservation) | `src/components/WorkoutList.tsx` |
| Compare tab (data merging) | `src/components/CompareTab.tsx` |
| Auto-sync / manual button | `src/App.tsx` |
| Setup wizard sync | `src/components/SetupWizard.tsx` |
| Manual sync UI | `src/components/ApiSync.tsx` |
