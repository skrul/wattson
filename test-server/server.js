import express from "express";
import {
  USER_ID,
  USER_EMAIL,
  makeJwt,
  makeWorkout,
  makeWorkoutDetail,
  makePerformanceGraph,
  makeRideDetails,
  makeUserProfile,
} from "./fixtures.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------- State ---------------

let workouts = [];
let callLog = [];
let rejectNextWorkoutFetch = false; // When true, the next /workouts request returns 401

function resetState(count = 5) {
  workouts = [];
  for (let i = 0; i < count; i++) {
    workouts.push(makeWorkout(i, count));
  }
}

function logCall(method, path) {
  callLog.push({ method, path, timestamp: Date.now() });
}

// Initialize with 5 workouts
resetState(5);

// --------------- Peloton API routes ---------------

// OAuth login — always returns a valid token (test server, no real auth)
app.post("/oauth/token", (req, res) => {
  logCall("POST", "/oauth/token");
  const token = makeJwt(USER_ID);
  res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 86400,
  });
});

// User profile
app.get("/api/me", (req, res) => {
  logCall("GET", "/api/me");
  const profile = makeUserProfile();
  profile.total_workouts = workouts.length;
  res.json(profile);
});

// Paginated workout list (sorted newest-first, like the real Peloton API)
app.get("/api/user/:userId/workouts", (req, res) => {
  logCall("GET", `/api/user/${req.params.userId}/workouts`);

  // Simulate token expiry: return 401 once, then reset the flag
  if (rejectNextWorkoutFetch) {
    rejectNextWorkoutFetch = false;
    return res.status(401).json({ error: "Token expired" });
  }

  const sorted = [...workouts].sort((a, b) => b.created_at - a.created_at);
  const limit = parseInt(req.query.limit || "100", 10);
  const page = parseInt(req.query.page || "0", 10);
  const start = page * limit;
  const pageData = sorted.slice(start, start + limit);
  const pageCount = Math.max(1, Math.ceil(workouts.length / limit));

  res.json({
    data: pageData,
    total: workouts.length,
    page,
    limit,
    page_count: pageCount,
  });
});

// Workout detail
app.get("/api/workout/:workoutId", (req, res) => {
  logCall("GET", `/api/workout/${req.params.workoutId}`);
  const workout = workouts.find((w) => w.id === req.params.workoutId);
  if (!workout) return res.status(404).json({ error: "Not found" });
  res.json(makeWorkoutDetail(workout));
});

// Performance graph
app.get("/api/workout/:workoutId/performance_graph", (req, res) => {
  logCall("GET", `/api/workout/${req.params.workoutId}/performance_graph`);
  const workout = workouts.find((w) => w.id === req.params.workoutId);
  if (!workout) return res.status(404).json({ error: "Not found" });
  res.json(makePerformanceGraph(workout));
});

// Ride details
app.get("/api/ride/:rideId/details", (req, res) => {
  logCall("GET", `/api/ride/${req.params.rideId}/details`);
  const workout = workouts.find((w) => w.ride?.id === req.params.rideId);
  if (!workout) return res.status(404).json({ error: "Not found" });
  res.json(makeRideDetails(workout));
});

// --------------- Admin API ---------------

app.post("/admin/reset", (req, res) => {
  const count = req.body?.count ?? 5;
  resetState(count);
  callLog = [];
  res.json({ ok: true, workoutCount: workouts.length });
});

app.post("/admin/add-workouts", (req, res) => {
  const count = req.body?.count ?? 1;
  const currentTotal = workouts.length;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const w = makeWorkout(currentTotal + i, currentTotal + count);
    // Override timestamps so new workouts sort before all existing ones
    w.created_at = now + i + 1;
    w.start_time = w.created_at;
    w.end_time = w.created_at + w._duration;
    workouts.push(w);
  }
  res.json({ ok: true, workoutCount: workouts.length });
});

app.post("/admin/reject-next-workout-fetch", (_req, res) => {
  rejectNextWorkoutFetch = true;
  res.json({ ok: true });
});

app.get("/admin/call-log", (_req, res) => {
  res.json(callLog);
});

app.post("/admin/clear-log", (_req, res) => {
  callLog = [];
  res.json({ ok: true });
});

// --------------- Start ---------------

const server = app.listen(PORT, () => {
  console.log(`Fake Peloton server listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

export default server;
