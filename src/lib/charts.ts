import type { Workout, MetricSample } from "../types";

/**
 * Render an output-over-time chart (dot/line plot across rides).
 * Uses Observable Plot. Returns an SVG element to mount in the DOM.
 */
export function renderOutputOverTimeChart(_workouts: Workout[]): SVGElement | HTMLElement {
  // TODO: implement with Observable Plot
  const placeholder = document.createElement("div");
  placeholder.textContent = "Output over time chart placeholder";
  return placeholder;
}

/**
 * Render a single-ride detail chart (time series of output, cadence, etc.).
 * Uses Observable Plot. Returns an SVG element to mount in the DOM.
 */
export function renderRideDetailChart(_metrics: MetricSample[]): SVGElement | HTMLElement {
  // TODO: implement with Observable Plot
  const placeholder = document.createElement("div");
  placeholder.textContent = "Ride detail chart placeholder";
  return placeholder;
}
