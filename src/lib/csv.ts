import type { Workout } from "../types";

/**
 * Parse a Peloton CSV export file into Workout objects.
 * The CSV is the standard export from pelotoninteractive.com profile settings.
 */
export function parsePelotonCsv(_csvText: string): Workout[] {
  // TODO: implement CSV parsing
  return [];
}
