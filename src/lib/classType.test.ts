import { describe, it, expect } from "vitest";
import { parseClassType, parseClassSubtype } from "./classType";

describe("parseClassType", () => {
  // --- null / empty input ---
  it("returns null for null title", () => {
    expect(parseClassType(null, "cycling")).toBeNull();
  });

  it("returns null for empty title", () => {
    expect(parseClassType("", "cycling")).toBeNull();
  });

  it("returns null for null discipline with no shared match", () => {
    expect(parseClassType("Something Random", null)).toBeNull();
  });

  it("returns null for unrecognized title", () => {
    expect(parseClassType("30 min Just Work Out", "cycling")).toBeNull();
  });

  // --- shared patterns (discipline-agnostic) ---
  it("matches Warm Up across disciplines", () => {
    expect(parseClassType("5 min Warm Up", "cycling")).toBe("Warm Up");
    expect(parseClassType("10 min Warm Up", "running")).toBe("Warm Up");
    expect(parseClassType("5 min Warm Up", null)).toBe("Warm Up");
  });

  it("matches Cool Down across disciplines", () => {
    expect(parseClassType("5 min Cool Down", "cycling")).toBe("Cool Down");
    expect(parseClassType("10 min Cool Down Ride", "cycling")).toBe("Cool Down");
  });

  it("matches Beginner across disciplines", () => {
    expect(parseClassType("20 min Beginner Ride", "cycling")).toBe("Beginner");
    expect(parseClassType("20 min Beginner Run", "running")).toBe("Beginner");
  });

  it("matches Low Impact across disciplines", () => {
    expect(parseClassType("30 min Low Impact Ride", "cycling")).toBe("Low Impact");
  });

  // --- case insensitivity ---
  it("matches case-insensitively", () => {
    expect(parseClassType("30 MIN POWER ZONE RIDE", "cycling")).toBe("Power Zone");
    expect(parseClassType("30 min power zone ride", "cycling")).toBe("Power Zone");
  });

  // --- cycling patterns ---
  it("matches Power Zone", () => {
    expect(parseClassType("30 min Power Zone Ride", "cycling")).toBe("Power Zone");
    expect(parseClassType("45 min Power Zone Endurance Ride", "cycling")).toBe("Power Zone");
    expect(parseClassType("30 min Power Zone Max Ride", "cycling")).toBe("Power Zone");
  });

  it("matches FTP as Power Zone", () => {
    expect(parseClassType("20 min FTP Test Ride", "cycling")).toBe("Power Zone");
    expect(parseClassType("10 min FTP Warm Up Ride", "cycling")).toBe("Power Zone");
  });

  it("matches Intervals", () => {
    expect(parseClassType("30 min Intervals & Arms Ride", "cycling")).toBe("Intervals");
  });

  it("matches HIIT as Intervals", () => {
    expect(parseClassType("20 min HIIT Ride", "cycling")).toBe("Intervals");
  });

  it("matches Progression", () => {
    expect(parseClassType("30 min Progression Ride", "cycling")).toBe("Progression");
  });

  it("matches Progressive as Progression", () => {
    expect(parseClassType("30 min Progressive Ride", "cycling")).toBe("Progression");
  });

  it("matches Sweat Steady as Progression", () => {
    expect(parseClassType("30 min Sweat Steady Ride", "cycling")).toBe("Progression");
  });

  it("matches Climb", () => {
    expect(parseClassType("30 min Climb Ride", "cycling")).toBe("Climb");
  });

  it("matches Rolling Hills as Climb", () => {
    expect(parseClassType("30 min Rolling Hills Ride", "cycling")).toBe("Climb");
  });

  it("matches Live DJ", () => {
    expect(parseClassType("30 min Live DJ Ride", "cycling")).toBe("Live DJ");
  });

  it("matches Groove", () => {
    expect(parseClassType("30 min Groove Ride", "cycling")).toBe("Groove");
  });

  it("matches Pro Cyclist", () => {
    expect(parseClassType("30 min Pro Cyclist Ride", "cycling")).toBe("Pro Cyclist");
  });

  it("matches Peloton Studio Original", () => {
    expect(parseClassType("30 min Peloton Studio Original", "cycling")).toBe("Peloton Studio Original");
  });

  it("returns null for unmatched cycling title", () => {
    expect(parseClassType("30 min Pop Ride", "cycling")).toBeNull();
  });

  // --- discipline scoping ---
  it("does not match cycling patterns for running discipline", () => {
    expect(parseClassType("30 min Power Zone Run", "running")).toBeNull();
  });

  it("returns null for non-cycling disciplines without shared match", () => {
    expect(parseClassType("30 min Fun Run", "running")).toBeNull();
    expect(parseClassType("20 min Upper Body Strength", "strength")).toBeNull();
    expect(parseClassType("30 min Yoga", "yoga")).toBeNull();
    expect(parseClassType("10 min Stretch", "stretching")).toBeNull();
    expect(parseClassType("10 min Meditation", "meditation")).toBeNull();
    expect(parseClassType("20 min HIIT Cardio", "cardio")).toBeNull();
    expect(parseClassType("20 min Row", "rowing")).toBeNull();
  });

  // --- unknown discipline ---
  it("still matches shared patterns for unknown discipline", () => {
    expect(parseClassType("5 min Warm Up", "bike_bootcamp")).toBe("Warm Up");
  });

  it("returns null for unknown discipline with no shared match", () => {
    expect(parseClassType("30 min Something", "bike_bootcamp")).toBeNull();
  });
});

describe("parseClassSubtype", () => {
  it("returns null for null title", () => {
    expect(parseClassSubtype(null, "Power Zone")).toBeNull();
  });

  it("returns null for null classType", () => {
    expect(parseClassSubtype("30 min Power Zone Ride", null)).toBeNull();
  });

  it("returns null for non-Power-Zone classType", () => {
    expect(parseClassSubtype("30 min Climb Ride", "Climb")).toBeNull();
    expect(parseClassSubtype("30 min Intervals Ride", "Intervals")).toBeNull();
  });

  it("returns 'Power Zone' as fallback for generic Power Zone title", () => {
    expect(parseClassSubtype("30 min Power Zone Ride", "Power Zone")).toBe("Power Zone");
  });

  it("matches Power Zone Endurance", () => {
    expect(parseClassSubtype("45 min Power Zone Endurance Ride", "Power Zone")).toBe("Power Zone Endurance");
  });

  it("matches Power Zone Max", () => {
    expect(parseClassSubtype("30 min Power Zone Max Ride", "Power Zone")).toBe("Power Zone Max");
  });

  it("matches FTP Test", () => {
    expect(parseClassSubtype("20 min FTP Test Ride", "Power Zone")).toBe("FTP Test");
  });

  it("matches FTP Warm Up", () => {
    expect(parseClassSubtype("10 min FTP Warm Up Ride", "Power Zone")).toBe("FTP Warm Up");
  });

  it("matches case-insensitively", () => {
    expect(parseClassSubtype("45 MIN POWER ZONE ENDURANCE RIDE", "Power Zone")).toBe("Power Zone Endurance");
  });
});
