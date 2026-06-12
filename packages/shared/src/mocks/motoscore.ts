const clamp = (min: number, max: number, n: number) => Math.min(max, Math.max(min, n));

/**
 * Display-only helper. Real source of truth is the motoscore table;
 * RPCs apply deltas server-side.
 */
export function computeMotoScore(onTimeServices: number, lateServices: number): number {
  return clamp(300, 850, 600 + 5 * onTimeServices - 15 * lateServices);
}

/** Odometer estimation from fuel top-up (Finance Hub). */
export function estimateOdometer(liters: number, avgKml: number): number {
  return Math.round(liters * avgKml);
}
