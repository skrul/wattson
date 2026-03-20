/** Bump this when patterns change to trigger re-parse of existing rows. */
export const PARSE_VERSION = 3;

interface PatternEntry {
  pattern: RegExp;
  classType: string;
}

const CYCLING_PATTERNS: PatternEntry[] = [
  { pattern: /peloton studio original/i, classType: "Peloton Studio Original" },
  { pattern: /pro cyclist/i, classType: "Pro Cyclist" },
  { pattern: /power zone/i, classType: "Power Zone" },
  { pattern: /ftp/i, classType: "Power Zone" },
  { pattern: /live dj/i, classType: "Live DJ" },
  { pattern: /intervals/i, classType: "Intervals" },
  { pattern: /hiit/i, classType: "Intervals" },
  { pattern: /progression/i, classType: "Progression" },
  { pattern: /progressive/i, classType: "Progression" },
  { pattern: /sweat steady/i, classType: "Progression" },
  { pattern: /climb/i, classType: "Climb" },
  { pattern: /rolling hills/i, classType: "Climb" },
  { pattern: /groove/i, classType: "Groove" },
];

const RUNNING_PATTERNS: PatternEntry[] = [];
const STRENGTH_PATTERNS: PatternEntry[] = [];
const YOGA_PATTERNS: PatternEntry[] = [];
const STRETCHING_PATTERNS: PatternEntry[] = [];
const MEDITATION_PATTERNS: PatternEntry[] = [];
const CARDIO_PATTERNS: PatternEntry[] = [];
const ROWING_PATTERNS: PatternEntry[] = [];

const DISCIPLINE_PATTERNS: Record<string, PatternEntry[]> = {
  cycling: CYCLING_PATTERNS,
  running: RUNNING_PATTERNS,
  strength: STRENGTH_PATTERNS,
  yoga: YOGA_PATTERNS,
  stretching: STRETCHING_PATTERNS,
  meditation: MEDITATION_PATTERNS,
  cardio: CARDIO_PATTERNS,
  rowing: ROWING_PATTERNS,
};

const SHARED_PATTERNS: PatternEntry[] = [
  { pattern: /warm up/i, classType: "Warm Up" },
  { pattern: /cool down/i, classType: "Cool Down" },
  { pattern: /beginner/i, classType: "Beginner" },
  { pattern: /low impact/i, classType: "Low Impact" },
];

/**
 * Derive a class type from the workout title and discipline via keyword matching.
 * Returns null if no pattern matches.
 */
export function parseClassType(
  title: string | null,
  discipline: string | null,
): string | null {
  if (!title) return null;

  // Check discipline-specific patterns first (they take priority over shared)
  if (discipline) {
    const patterns = DISCIPLINE_PATTERNS[discipline];
    if (patterns) {
      for (const { pattern, classType } of patterns) {
        if (pattern.test(title)) return classType;
      }
    }
  }

  // Check shared patterns
  for (const { pattern, classType } of SHARED_PATTERNS) {
    if (pattern.test(title)) return classType;
  }

  return null;
}

interface SubtypeEntry {
  pattern: RegExp;
  subtype: string;
}

const POWER_ZONE_SUBTYPES: SubtypeEntry[] = [
  { pattern: /power zone endurance/i, subtype: "Power Zone Endurance" },
  { pattern: /power zone max/i, subtype: "Power Zone Max" },
  { pattern: /ftp test/i, subtype: "FTP Test" },
  { pattern: /ftp warm up/i, subtype: "FTP Warm Up" },
];

/**
 * Extract class type from the API's structured class_types array in raw ride details JSON.
 * The array lives at the top level ($.class_types), not under $.ride.
 * Returns null if array is empty or parsing fails.
 */
export function extractApiClassType(rawRideDetailsJson: string): string | null {
  try {
    const data = JSON.parse(rawRideDetailsJson);
    const classTypes: { name: string }[] | undefined = data?.class_types;
    if (!Array.isArray(classTypes) || classTypes.length === 0) return null;
    const names = classTypes.map((ct) => ct.name).filter(Boolean);
    if (names.length === 0) return null;
    return names.join(" / ");
  } catch {
    return null;
  }
}

/**
 * Derive a class subtype from the workout title and class type.
 * Currently only Power Zone has subtypes; all others return null.
 */
export function parseClassSubtype(
  title: string | null,
  classType: string | null,
): string | null {
  if (!title || classType !== "Power Zone") return null;

  for (const { pattern, subtype } of POWER_ZONE_SUBTYPES) {
    if (pattern.test(title)) return subtype;
  }

  return "Power Zone";
}
