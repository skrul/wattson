// Fake Peloton API fixture data for E2E tests.

const USER_ID = "fake-user-id-12345";
const USER_EMAIL = "test@example.com";

/** Build a fake JWT: base64(header).base64(payload).dummy */
function makeJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64").replace(/=+$/, "");
  const payload = Buffer.from(
    JSON.stringify({
      "http://onepeloton.com/user_id": userId,
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  ).toString("base64").replace(/=+$/, "");
  return `${header}.${payload}.fakesignature`;
}

const INSTRUCTORS = [
  { name: "Alex Toussaint" },
  { name: "Cody Rigsby" },
  { name: "Robin Arzon" },
  { name: "Ben Alldis" },
  { name: "Jess King" },
];

function makeWorkout(index, total) {
  const id = `workout-${String(index).padStart(4, "0")}`;
  const rideId = `ride-${String(index).padStart(4, "0")}`;
  const isCycling = index % 3 !== 0; // 2/3 cycling, 1/3 strength
  const discipline = isCycling ? "cycling" : "strength";
  const instructor = INSTRUCTORS[index % INSTRUCTORS.length];
  const duration = isCycling ? 1800 : 1200; // 30min cycling, 20min strength
  const createdAt = Math.floor(Date.now() / 1000) - (total - index) * 86400; // one per day going back

  const titles = isCycling
    ? [
        "30 min Power Zone Ride",
        "30 min HIIT & Hills Ride",
        "30 min Climb Ride",
        "30 min Groove Ride",
        "30 min Intervals Ride",
      ]
    : [
        "20 min Full Body Strength",
        "20 min Upper Body Strength",
        "20 min Core Strength",
      ];
  const title = titles[index % titles.length];

  return {
    id,
    status: "COMPLETE",
    created_at: createdAt,
    start_time: createdAt,
    end_time: createdAt + duration,
    fitness_discipline: discipline,
    is_outdoor: false,
    total_work: isCycling ? 250000 + index * 1000 : 0,
    workout_type: null,
    effort_zones: isCycling
      ? {
          total_effort_points: 45 + index,
          heart_rate_zone_durations: {
            heart_rate_z1_duration: 120,
            heart_rate_z2_duration: 600,
            heart_rate_z3_duration: 480,
            heart_rate_z4_duration: 360,
            heart_rate_z5_duration: 240,
          },
        }
      : null,
    ride: {
      id: rideId,
      title,
      duration,
      is_live_in_studio_only: false,
      instructor,
      fitness_discipline: discipline,
    },
    is_total_work_personal_record: index === 0,
    _rideId: rideId,
    _discipline: discipline,
    _title: title,
    _instructor: instructor,
    _duration: duration,
  };
}

function makeWorkoutDetail(workout) {
  return {
    id: workout.id,
    status: "COMPLETE",
    created_at: workout.created_at,
    start_time: workout.start_time,
    end_time: workout.end_time,
    fitness_discipline: workout.fitness_discipline,
    total_work: workout.total_work,
    ride: workout.ride
      ? {
          id: workout.ride.id,
          title: workout.ride.title,
          duration: workout.ride.duration,
          instructor: workout.ride.instructor,
        }
      : null,
  };
}

function makePerformanceGraph(workout) {
  const isCycling = workout.fitness_discipline === "cycling";
  return {
    duration: workout.ride?.duration ?? 1200,
    summaries: [
      { slug: "calories", value: isCycling ? 350 : 200 },
      { slug: "distance", value: isCycling ? 12.5 : 0 },
      { slug: "total_output", value: isCycling ? 250 : 0 },
    ],
    average_summaries: [
      { slug: "avg_output", value: isCycling ? 140 : 0 },
      { slug: "avg_cadence", value: isCycling ? 85 : 0 },
      { slug: "avg_resistance", value: isCycling ? 42 : 0 },
      { slug: "avg_speed", value: isCycling ? 25.1 : 0 },
    ],
    metrics: [
      {
        slug: "heart_rate",
        average_value: 145,
        max_value: 175,
        values: [140, 145, 150, 148, 142],
      },
      {
        slug: "output",
        average_value: isCycling ? 140 : 0,
        max_value: isCycling ? 210 : 0,
        values: isCycling ? [120, 140, 160, 150, 130] : [],
      },
    ],
    effort_zones: workout.effort_zones ?? null,
  };
}

function makeRideDetails(workout) {
  const isCycling = workout.fitness_discipline === "cycling";
  return {
    ride: {
      id: workout.ride?.id,
      title: workout.ride?.title,
      duration: workout.ride?.duration,
      instructor: workout.ride?.instructor,
    },
    class_types: isCycling
      ? [{ name: "Cycling" }]
      : [{ name: "Strength" }],
  };
}

function makeUserProfile() {
  return {
    id: USER_ID,
    first_name: "Test",
    last_name: "User",
    username: "testuser",
    total_workouts: 0, // will be overridden dynamically
    image_url: null,
    created_at: Math.floor(Date.now() / 1000) - 365 * 86400,
  };
}

export {
  USER_ID,
  USER_EMAIL,
  makeJwt,
  makeWorkout,
  makeWorkoutDetail,
  makePerformanceGraph,
  makeRideDetails,
  makeUserProfile,
};
