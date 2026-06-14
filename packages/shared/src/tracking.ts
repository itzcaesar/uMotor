// Pure ride-tracking domain logic. No React Native / Expo imports — runs in the
// app, in tests, and (mirrored) in supabase/migrations/0003_rides.sql. The
// consumer app's lib/tracking.ts wraps this with the actual sensor plumbing.

import type { LatLng, RideActivity, RideEventType } from './types';

const EARTH_R = 6_371_000; // metres
const toRad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Tunables shared by the client engine and (where applicable) finish_ride. */
export const TRACKING = {
  ACCURACY_GATE_M: 50, // drop fixes worse than this
  MAX_SPEED_MPS: 33.3, // ~120 km/h; above this between two fixes = teleport
  MIN_RIDE_DISTANCE_M: 300,
  MIN_RIDE_DURATION_S: 60,
  // Ride state machine.
  START_SPEED_KMH: 12, // sustained speed to auto-start
  START_DWELL_S: 8,
  STOP_SPEED_KMH: 4, // below this for STOP_DWELL_S → auto-stop
  STOP_DWELL_S: 90,
  // Harsh-event detection (longitudinal accel from speed delta).
  HARSH_ACCEL_MPS2: 3.0,
  HARSH_BRAKE_MPS2: 3.5,
  SHARP_LEAN_DEG: 28,
  // Classifier.
  WALK_MAX_KMH: 8,
  RUN_MAX_KMH: 16,
  WALK_CADENCE_HZ: [1.4, 2.6] as const,
  RUN_CADENCE_HZ: [2.4, 3.6] as const,
  MOTO_VIBRATION_RMS: 1.1, // accel RMS (g) separating motorcycle from car
} as const;

export const MPS_TO_KMH = 3.6;
export const kmh = (mps: number) => mps * MPS_TO_KMH;
export const mps = (kmhVal: number) => kmhVal / MPS_TO_KMH;

// ── Geometry ────────────────────────────────────────────────────────────────
/** Great-circle distance between two coords, in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface CleanPoint extends LatLng {
  ts: number; // epoch ms
  accuracyM?: number | null;
}

/**
 * Client-side distance estimate mirroring finish_ride: sums only segments whose
 * endpoints are accurate enough and whose implied speed is physically plausible.
 * The server value is still the source of truth for rewards.
 */
export function cleanDistance(points: CleanPoint[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = (b.ts - a.ts) / 1000;
    if (dt <= 0) continue;
    if ((a.accuracyM ?? 0) > TRACKING.ACCURACY_GATE_M) continue;
    if ((b.accuracyM ?? 0) > TRACKING.ACCURACY_GATE_M) continue;
    const seg = haversine(a, b);
    if (seg / dt > TRACKING.MAX_SPEED_MPS) continue; // teleport
    dist += seg;
  }
  return dist;
}

/** True when the jump between two fixes is physically impossible (spoof/jitter). */
export function isTeleport(distanceM: number, dtSeconds: number): boolean {
  return dtSeconds > 0 && distanceM / dtSeconds > TRACKING.MAX_SPEED_MPS;
}

/** Exponential moving-average smoother for jittery lat/lng (per-axis). */
export function makeSmoother(alpha = 0.35) {
  let prev: LatLng | null = null;
  return (p: LatLng): LatLng => {
    if (!prev) {
      prev = p;
      return p;
    }
    const next = {
      lat: prev.lat + alpha * (p.lat - prev.lat),
      lng: prev.lng + alpha * (p.lng - prev.lng),
    };
    prev = next;
    return next;
  };
}

// ── Motion classification ─────────────────────────────────────────────────────
export interface MotionFeatures {
  speedKmh: number;
  /** Step frequency from the pedometer, Hz. 0 if not stepping. */
  cadenceHz: number;
  /** Accelerometer RMS magnitude in g (vibration energy). */
  accelRms: number;
  /** Absolute roll angle from gravity vector, degrees (lean). */
  leanDeg: number;
}

const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi;

/**
 * Heuristic activity classifier. Walking/running keyed off step cadence; the
 * harder motorcycle-vs-car split leans on vibration energy and body lean, since
 * both are low-cadence at speed. Returns 'unknown' when stationary/ambiguous.
 */
export function classifyActivity(f: MotionFeatures): RideActivity {
  if (f.speedKmh < 1.5) return 'unknown';
  if (f.speedKmh <= TRACKING.WALK_MAX_KMH && within(f.cadenceHz, TRACKING.WALK_CADENCE_HZ)) {
    return 'walking';
  }
  if (f.speedKmh <= TRACKING.RUN_MAX_KMH && within(f.cadenceHz, TRACKING.RUN_CADENCE_HZ)) {
    return 'running';
  }
  if (f.speedKmh >= TRACKING.WALK_MAX_KMH && f.cadenceHz < 1.2) {
    return f.accelRms >= TRACKING.MOTO_VIBRATION_RMS || f.leanDeg >= TRACKING.SHARP_LEAN_DEG
      ? 'motorcycle'
      : 'vehicle';
  }
  return 'unknown';
}

/** A short majority vote over recent classifications, to debounce flicker. */
export function majorityActivity(window: RideActivity[]): RideActivity {
  const tally = new Map<RideActivity, number>();
  for (const a of window) tally.set(a, (tally.get(a) ?? 0) + 1);
  let best: RideActivity = 'unknown';
  let n = -1;
  for (const [a, c] of tally) if (c > n) ((best = a), (n = c));
  return best;
}

// ── Events & scoring ───────────────────────────────────────────────────────
/** Longitudinal harsh-event detection from the speed delta between two fixes. */
export function detectAccelEvent(
  prevMps: number,
  curMps: number,
  dtSeconds: number,
): RideEventType | null {
  if (dtSeconds <= 0) return null;
  const a = (curMps - prevMps) / dtSeconds; // m/s²
  if (a <= -TRACKING.HARSH_BRAKE_MPS2) return 'harsh_brake';
  if (a >= TRACKING.HARSH_ACCEL_MPS2) return 'harsh_accel';
  return null;
}

/** Eco/smoothness score 0–100. Mirrors finish_ride: 100 − 8 per harsh event. */
export function ecoScore(harshEvents: number): number {
  return clamp(100 - 8 * harshEvents, 0, 100);
}

// ── Formatting (id-ID) ───────────────────────────────────────────────────────
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return (
    (meters / 1000).toLocaleString('id-ID', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' km'
  );
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} jam ${rem} mnt` : `${h} jam`;
}

export function formatSpeed(kmhVal: number): string {
  return `${Math.round(kmhVal)} km/jam`;
}

export const ACTIVITY_LABELS: Record<RideActivity, string> = {
  motorcycle: 'Berkendara',
  walking: 'Jalan kaki',
  running: 'Lari',
  vehicle: 'Kendaraan lain',
  unknown: 'Tidak terdeteksi',
};

export const RIDE_EVENT_LABELS: Record<RideEventType, string> = {
  harsh_brake: 'Rem mendadak',
  harsh_accel: 'Akselerasi kasar',
  sharp_lean: 'Menikung tajam',
  overspeed: 'Melebihi batas',
  idle: 'Diam',
};

// ── SVG route projection ─────────────────────────────────────────────────────
export interface ProjectedRoute {
  points: { x: number; y: number }[];
  /** The viewbox the points were projected into. */
  width: number;
  height: number;
}

/**
 * Equirectangular projection of a route into an SVG viewbox, longitude scaled by
 * cos(lat) so the shape isn't stretched. Aspect-preserving + centered. Lets us
 * draw routes with react-native-svg — no native map module, so it works in Expo Go.
 */
export function projectRoute(
  coords: LatLng[],
  width: number,
  height: number,
  padding = 16,
): ProjectedRoute {
  if (coords.length === 0) return { points: [], width, height };
  const meanLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const k = Math.cos(toRad(meanLat));
  const planar = coords.map((c) => ({ x: c.lng * k, y: c.lat }));

  const xs = planar.map((p) => p.x);
  const ys = planar.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;

  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const scale = Math.min(usableW / spanX, usableH / spanY);
  // Centre the (scaled) bbox within the usable area.
  const offX = padding + (usableW - spanX * scale) / 2;
  const offY = padding + (usableH - spanY * scale) / 2;

  const points = planar.map((p) => ({
    x: offX + (p.x - minX) * scale,
    // Flip Y so north is up.
    y: height - (offY + (p.y - minY) * scale),
  }));
  return { points, width, height };
}

// ── Simulated ride (deterministic stage demo) ───────────────────────────────
/** Waypoints of the seeded hero route (east Bandung loop). */
export const SIMULATED_WAYPOINTS: LatLng[] = [
  { lat: -6.9147, lng: 107.6722 },
  { lat: -6.9131, lng: 107.676 },
  { lat: -6.91, lng: 107.6795 },
  { lat: -6.9072, lng: 107.6831 },
  { lat: -6.904, lng: 107.6858 },
  { lat: -6.9012, lng: 107.6829 },
  { lat: -6.8995, lng: 107.6788 },
  { lat: -6.902, lng: 107.6749 },
  { lat: -6.9058, lng: 107.6717 },
  { lat: -6.909, lng: 107.6688 },
  { lat: -6.9122, lng: 107.6669 },
  { lat: -6.915, lng: 107.6693 },
  { lat: -6.9152, lng: 107.6722 },
];

export interface SimSample extends LatLng {
  speedMps: number;
  accuracyM: number;
}

/**
 * Densify the waypoints into ~1 Hz samples for the simulated player, so the live
 * map animates smoothly and finish_ride sees a realistic point stream. Uses no
 * randomness so the demo is byte-for-byte repeatable.
 */
export function buildSimulatedTrack(stepMeters = 12): SimSample[] {
  const out: SimSample[] = [];
  for (let i = 1; i < SIMULATED_WAYPOINTS.length; i++) {
    const a = SIMULATED_WAYPOINTS[i - 1];
    const b = SIMULATED_WAYPOINTS[i];
    const segLen = haversine(a, b);
    const steps = Math.max(2, Math.round(segLen / stepMeters));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        speedMps: stepMeters, // ~1 sample/s ⇒ speed ≈ step length
        accuracyM: 6 + (out.length % 4),
      });
    }
  }
  const last = SIMULATED_WAYPOINTS[SIMULATED_WAYPOINTS.length - 1];
  out.push({ ...last, speedMps: 0, accuracyM: 6 });
  return out;
}
