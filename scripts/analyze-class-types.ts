/**
 * Analyze class_type data from raw_ride_details_json in the database.
 * Compares API-provided class_types with our title-based parsing.
 *
 * Usage: npx tsx scripts/analyze-class-types.ts
 */
import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

const dbPath = join(homedir(), "Library/Application Support/com.wattson.dev/wattson.db");
const db = new Database(dbPath, { readonly: true });

interface Row {
  title: string;
  discipline: string;
  class_type: string | null;
  class_subtype: string | null;
  raw_ride_details_json: string;
}

const rows = db.prepare(`
  SELECT title, discipline, class_type, class_subtype, raw_ride_details_json
  FROM workouts
  WHERE raw_ride_details_json IS NOT NULL
  ORDER BY date DESC
`).all() as Row[];

console.log(`Total workouts with ride details: ${rows.length}\n`);

// --- 1. Collect all API class_types ---
const apiClassTypes = new Map<string, number>(); // name → count
const noClassType: { title: string; discipline: string }[] = [];
const mismatches: { title: string; discipline: string; parsed: string | null; api: string[] }[] = [];

for (const row of rows) {
  let rideData: { ride?: { class_types?: { id: string; name: string }[] } };
  try {
    rideData = JSON.parse(row.raw_ride_details_json);
  } catch {
    continue;
  }

  const classTypes = rideData.ride?.class_types ?? [];
  const apiNames = classTypes.map((ct) => ct.name);

  if (apiNames.length === 0) {
    noClassType.push({ title: row.title, discipline: row.discipline });
  }

  for (const name of apiNames) {
    apiClassTypes.set(name, (apiClassTypes.get(name) ?? 0) + 1);
  }

  // Compare with our parsed class_type
  const parsed = row.class_type;
  const apiFirst = apiNames[0] ?? null;
  if (parsed !== apiFirst && !(parsed === null && apiFirst === null)) {
    mismatches.push({ title: row.title, discipline: row.discipline, parsed, api: apiNames });
  }
}

// --- 2. Print API class_type distribution ---
console.log("=== API class_types (from ride details) ===");
const sorted = [...apiClassTypes.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sorted) {
  console.log(`  ${name}: ${count}`);
}
console.log(`  (no class_types): ${noClassType.length}`);
console.log();

// --- 3. Print mismatches ---
console.log(`=== Mismatches: parsed vs API (${mismatches.length} total) ===`);
// Group by mismatch type
const mismatchGroups = new Map<string, number>();
for (const m of mismatches) {
  const key = `parsed="${m.parsed}" vs api="${m.api.join(", ")}"`;
  mismatchGroups.set(key, (mismatchGroups.get(key) ?? 0) + 1);
}
const sortedMismatches = [...mismatchGroups.entries()].sort((a, b) => b[1] - a[1]);
for (const [key, count] of sortedMismatches) {
  console.log(`  ${key}: ${count}`);
}
console.log();

// --- 4. Show examples of mismatches ---
console.log("=== Sample mismatches (first 20) ===");
for (const m of mismatches.slice(0, 20)) {
  console.log(`  "${m.title}" [${m.discipline}] → parsed="${m.parsed}" api=[${m.api.join(", ")}]`);
}
console.log();

// --- 5. Check what other useful fields exist on ride ---
console.log("=== Other potentially useful ride fields (sample) ===");
const sampleRow = rows[0];
if (sampleRow) {
  const data = JSON.parse(sampleRow.raw_ride_details_json);
  const ride = data.ride ?? {};
  const interestingKeys = [
    "class_types", "fitness_discipline", "fitness_discipline_display_name",
    "is_power_zone_class", "difficulty_level", "difficulty_estimate",
    "difficulty_rating_avg", "difficulty_rating_count",
    "overall_rating_avg", "overall_rating_count",
    "content_format", "duration", "title",
  ];
  for (const key of interestingKeys) {
    console.log(`  ${key}: ${JSON.stringify(ride[key])}`);
  }
}

db.close();
