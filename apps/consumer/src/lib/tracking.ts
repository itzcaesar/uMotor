// Ride recorder engine. Wraps the pure logic in @umotor/shared with real sensor
// plumbing: foreground GPS (expo-location) + accelerometer/pedometer (expo-sensors)
// for motion classification, plus a deterministic "simulated" source for stage
// demos. Everything degrades gracefully — a missing native module (or denied
// permission) just disables that source; the simulated player always works, so a
// projector demo never depends on actually riding a motorcycle on stage.
//
// Distance/rewards are NEVER trusted from here: stop() flushes the raw points and
// calls the finish_ride RPC, which recomputes everything server-side.

import { create } from 'zustand';
import {
  TRACKING,
  kmh,
  haversine,
  classifyActivity,
  majorityActivity,
  detectAccelEvent,
  buildSimulatedTrack,
  type RideActivity,
  type RideEventType,
  type RideSource,
} from '@umotor/shared';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

// ── Lazy native modules (Expo Go-safe) ───────────────────────────────────────
let _loc: any;
let _locTried = false;
async function loadLocation() {
  if (!_locTried) {
    _locTried = true;
    try {
      _loc = await import('expo-location');
    } catch {
      _loc = null;
    }
  }
  return _loc;
}

let _sensors: any;
let _sensorsTried = false;
async function loadSensors() {
  if (!_sensorsTried) {
    _sensorsTried = true;
    try {
      _sensors = await import('expo-sensors');
    } catch {
      _sensors = null;
    }
  }
  return _sensors;
}

// ── Engine state (module-scope; the store mirrors what the UI needs) ──────────
interface Sample {
  lat: number;
  lng: number;
  ts: number; // epoch ms
  accuracyM: number | null;
  speedMps: number | null;
  mocked: boolean;
}
interface PointRow {
  ride_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  mocked: boolean;
  activity: RideActivity;
}
interface EventRow {
  ride_id: string;
  ts: string;
  type: RideEventType;
  value: number | null;
  lat: number | null;
  lng: number | null;
}

type Sub = { remove: () => void } | null;
let locSub: Sub = null;
let accelSub: Sub = null;
let pedoSub: Sub = null;
let uiTicker: ReturnType<typeof setInterval> | null = null;
let simTimer: ReturnType<typeof setInterval> | null = null;

let curSource: RideSource = 'gps';
let startMs = 0;
let runningDist = 0;
let sinceFlush = 0;
let prev: Sample | null = null;
const actWindow: RideActivity[] = [];
let pendingPoints: PointRow[] = [];
let pendingEvents: EventRow[] = [];

// Live sensor features, updated by the accelerometer/pedometer listeners.
const feat = { accelRms: 0, leanDeg: 0, cadenceHz: 0 };
let lastSteps = 0;
let lastStepTs = 0;

const PATH_CAP = 800; // bound the on-screen polyline for very long rides

// ── Store ─────────────────────────────────────────────────────────────────
export interface RideState {
  status: 'idle' | 'starting' | 'active' | 'saving';
  source: RideSource;
  rideId: string | null;
  lastRideId: string | null;
  distanceM: number;
  durationS: number;
  speedKmh: number;
  maxKmh: number;
  activity: RideActivity;
  harshEvents: number;
  flagged: boolean; // mock-location seen mid-ride
  path: { lat: number; lng: number }[];
  error: string | null;
  startGps: (motorcycleId: string) => Promise<void>;
  startSimulated: (motorcycleId: string) => Promise<void>;
  stop: () => Promise<string | null>;
  reset: () => void;
}

const IDLE = {
  status: 'idle' as const,
  source: 'gps' as RideSource,
  rideId: null,
  distanceM: 0,
  durationS: 0,
  speedKmh: 0,
  maxKmh: 0,
  activity: 'unknown' as RideActivity,
  harshEvents: 0,
  flagged: false,
  path: [] as { lat: number; lng: number }[],
  error: null,
};

export const useRide = create<RideState>((set, get) => ({
  ...IDLE,
  lastRideId: null,

  startGps: async (motorcycleId) => {
    if (get().status !== 'idle') return;
    set({ ...IDLE, status: 'starting', source: 'gps' });
    const Location = await loadLocation();
    if (!Location) {
      set({ status: 'idle', error: 'Modul lokasi tidak tersedia. Coba "Simulasi ride".' });
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        set({ status: 'idle', error: 'Izin lokasi ditolak.' });
        return;
      }
      const rideId = await createRide(motorcycleId, 'gps');
      if (!rideId) {
        set({ status: 'idle', error: 'Gagal memulai ride.' });
        return;
      }
      resetEngine('gps', rideId, Date.now());
      await startSensors();
      locSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 4,
        },
        (loc: any) =>
          ingest(set, rideId, {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            ts: loc.timestamp ?? Date.now(),
            accuracyM: loc.coords.accuracy ?? null,
            speedMps: typeof loc.coords.speed === 'number' && loc.coords.speed >= 0 ? loc.coords.speed : null,
            mocked: Boolean(loc.mocked),
          }),
      );
      uiTicker = setInterval(() => {
        // Keep the clock moving even through GPS gaps.
        set((s) => ({ durationS: Math.max(s.durationS, Math.round((Date.now() - startMs) / 1000)) }));
      }, 1000);
      set({ status: 'active', rideId });
    } catch (e) {
      set({ status: 'idle', error: e instanceof Error ? e.message : 'Gagal memulai GPS.' });
    }
  },

  startSimulated: async (motorcycleId) => {
    if (get().status !== 'idle') return;
    set({ ...IDLE, status: 'starting', source: 'simulated' });
    try {
      // Pre-stamp the densified track with realistic timing (≈40 km/h) so the
      // server sees plausible segments and a real-looking duration.
      const track = buildSimulatedTrack(80);
      const targetMps = 11;
      let cum = 0;
      const stamped = track.map((p, i) => {
        if (i > 0) cum += haversine(track[i - 1], p);
        return { ...p, offsetS: cum / targetMps };
      });
      const totalS = stamped[stamped.length - 1]?.offsetS ?? 0;
      const base = Date.now() - totalS * 1000;
      const rideId = await createRide(motorcycleId, 'simulated', new Date(base).toISOString());
      if (!rideId) {
        set({ status: 'idle', error: 'Gagal memulai simulasi.' });
        return;
      }
      resetEngine('simulated', rideId, base);
      set({ status: 'active', rideId });
      let i = 0;
      simTimer = setInterval(() => {
        if (i >= stamped.length) {
          if (simTimer) clearInterval(simTimer);
          simTimer = null;
          return;
        }
        const p = stamped[i++];
        ingest(set, rideId, {
          lat: p.lat,
          lng: p.lng,
          ts: base + p.offsetS * 1000,
          accuracyM: p.accuracyM,
          speedMps: targetMps,
          mocked: false,
        });
      }, 110); // replays the whole ~15-min ride in ~15 s on stage
    } catch (e) {
      set({ status: 'idle', error: e instanceof Error ? e.message : 'Gagal simulasi.' });
    }
  },

  stop: async () => {
    const { rideId, status } = get();
    if (!rideId || status !== 'active') return null;
    set({ status: 'saving' });
    teardown();
    try {
      await flush(); // remaining buffered points + events
      const { error } = await supabase.rpc('finish_ride', { p_ride_id: rideId });
      if (error) throw error;
    } catch (e) {
      set({ status: 'idle', error: e instanceof Error ? e.message : 'Gagal menyimpan ride.', rideId: null });
      return rideId; // ride row still exists; let the user open it
    }
    set({ status: 'idle', rideId: null, lastRideId: rideId });
    return rideId;
  },

  reset: () => {
    teardown();
    set({ ...IDLE });
  },
}));

// ── Engine internals ────────────────────────────────────────────────────────
function resetEngine(source: RideSource, _rideId: string, start: number) {
  curSource = source;
  startMs = start;
  runningDist = 0;
  sinceFlush = 0;
  prev = null;
  actWindow.length = 0;
  pendingPoints = [];
  pendingEvents = [];
  feat.accelRms = 0;
  feat.leanDeg = 0;
  feat.cadenceHz = 0;
  lastSteps = 0;
  lastStepTs = 0;
}

async function createRide(
  motorcycleId: string,
  source: RideSource,
  startedAt?: string,
): Promise<string | null> {
  const userId = useSession.getState().userId;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('rides')
    .insert({
      user_id: userId,
      motorcycle_id: motorcycleId,
      source,
      ...(startedAt ? { started_at: startedAt } : {}),
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id as string;
}

async function startSensors() {
  const Sensors = await loadSensors();
  if (!Sensors) return;
  try {
    Sensors.Accelerometer.setUpdateInterval(200);
    accelSub = Sensors.Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
      const mag = Math.sqrt(x * x + y * y + z * z); // ~1g at rest
      feat.accelRms = feat.accelRms * 0.8 + Math.abs(mag - 1) * 0.2; // vibration energy
      feat.leanDeg = Math.abs((Math.atan2(x, Math.sqrt(y * y + z * z)) * 180) / Math.PI);
    });
  } catch {
    accelSub = null;
  }
  try {
    pedoSub = await Sensors.Pedometer?.watchStepCount?.(({ steps }: { steps: number }) => {
      const now = Date.now();
      if (lastStepTs) {
        const dt = (now - lastStepTs) / 1000;
        if (dt > 0) feat.cadenceHz = Math.max(0, (steps - lastSteps) / dt);
      }
      lastSteps = steps;
      lastStepTs = now;
    });
  } catch {
    pedoSub = null;
  }
}

function ingest(
  set: (updater: (cur: RideState) => Partial<RideState>) => void,
  rideId: string,
  s: Sample,
) {
  // Speed: prefer the GPS-reported value, else derive from the last fix.
  let speedMps = s.speedMps ?? 0;
  if (prev) {
    const dt = (s.ts - prev.ts) / 1000;
    if (dt > 0) {
      const seg = haversine(prev, s);
      if (s.speedMps == null) speedMps = seg / dt;
      const accurate =
        (s.accuracyM ?? 0) <= TRACKING.ACCURACY_GATE_M &&
        (prev.accuracyM ?? 0) <= TRACKING.ACCURACY_GATE_M;
      if (accurate && seg / dt <= TRACKING.MAX_SPEED_MPS) {
        runningDist += seg;
        const ev = detectAccelEvent(prev.speedMps ?? speedMps, speedMps, dt);
        if (ev) {
          pendingEvents.push({
            ride_id: rideId,
            ts: new Date(s.ts).toISOString(),
            type: ev,
            value: null,
            lat: s.lat,
            lng: s.lng,
          });
        }
      }
    }
  }

  const speedKmh = kmh(speedMps);
  // Classify (sim is always a motorcycle ride; GPS uses the sensor features).
  let activity: RideActivity;
  if (curSource === 'simulated') {
    activity = 'motorcycle';
  } else {
    actWindow.push(
      classifyActivity({
        speedKmh,
        cadenceHz: feat.cadenceHz,
        accelRms: feat.accelRms,
        leanDeg: feat.leanDeg,
      }),
    );
    if (actWindow.length > 8) actWindow.shift();
    activity = majorityActivity(actWindow);
  }

  pendingPoints.push({
    ride_id: rideId,
    ts: new Date(s.ts).toISOString(),
    lat: s.lat,
    lng: s.lng,
    accuracy_m: s.accuracyM,
    speed_mps: speedMps,
    mocked: s.mocked,
    activity,
  });

  prev = s;
  if (++sinceFlush >= 10) void flush();

  const plausibleKmh = kmh(TRACKING.MAX_SPEED_MPS);
  set((cur: RideState) => {
    const path = cur.path.length >= PATH_CAP ? cur.path.slice(-PATH_CAP + 1) : cur.path.slice();
    path.push({ lat: s.lat, lng: s.lng });
    return {
      distanceM: runningDist,
      durationS: Math.max(cur.durationS, Math.round((s.ts - startMs) / 1000)),
      speedKmh,
      maxKmh: speedKmh <= plausibleKmh ? Math.max(cur.maxKmh, speedKmh) : cur.maxKmh,
      activity,
      harshEvents: countHarsh(),
      flagged: cur.flagged || s.mocked,
      path,
    } as Partial<RideState>;
  });
}

let flushedHarsh = 0;
function countHarsh() {
  return flushedHarsh + pendingEvents.length;
}

async function flush() {
  sinceFlush = 0;
  if (pendingPoints.length) {
    const batch = pendingPoints;
    pendingPoints = [];
    const { error } = await supabase.from('ride_points').insert(batch);
    if (error) pendingPoints = batch.concat(pendingPoints); // re-queue on failure
  }
  if (pendingEvents.length) {
    const batch = pendingEvents;
    pendingEvents = [];
    const { error } = await supabase.from('ride_events').insert(batch);
    if (error) pendingEvents = batch.concat(pendingEvents);
    else flushedHarsh += batch.filter((e) => e.type !== 'idle').length;
  }
}

function teardown() {
  locSub?.remove();
  accelSub?.remove();
  pedoSub?.remove();
  locSub = accelSub = pedoSub = null;
  if (uiTicker) clearInterval(uiTicker);
  if (simTimer) clearInterval(simTimer);
  uiTicker = simTimer = null;
  flushedHarsh = 0;
}
