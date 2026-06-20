// Mirrors supabase/migrations/0001_init.sql — keep in sync by hand (prototype).

export type ComponentType = 'oil' | 'tire' | 'battery' | 'brake_pad' | 'air_filter';
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type WorkshopType = 'ahass' | 'independent';
export type WorkshopTier = 'basic' | 'premium';
export type PaymentType = 'deposit' | 'final' | 'sparepart' | 'bill';
export type BillType = 'stnk' | 'fuel' | 'installment';

export interface User {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  astrapay_balance: number;
  created_at: string;
  // AstraPay account binding (0004_astrapay.sql). Set once the wallet is linked;
  // the bound token itself lives server-side and is never read by the client.
  astrapay_phone?: string | null;
  astrapay_bound_at?: string | null;
}

export interface Motorcycle {
  id: string;
  user_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  odometer_km: number;
  avg_consumption_kml: number;
  photo_url: string | null;
  created_at: string;
}

export interface Component {
  id: string;
  motorcycle_id: string;
  type: ComponentType;
  interval_km: number;
  last_service_km: number;
}

export interface ComponentHealth extends Component {
  odometer_km: number;
  used_km: number;
  pct_used: number;
  health_pct: number;
}

export interface Workshop {
  id: string;
  name: string;
  type: WorkshopType;
  tier: WorkshopTier;
  rating: number;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  price_estimate_min: number | null;
  price_estimate_max: number | null;
  home_service: boolean;
  home_service_radius_km: number | null;
  home_service_fee: number | null;
  photo_url: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  duration_min: number;
  base_price: number;
}

export interface Slot {
  id: string;
  workshop_id: string;
  slot_at: string;
  capacity: number;
  booked_count: number;
}

export interface Booking {
  id: string;
  user_id: string;
  motorcycle_id: string;
  workshop_id: string;
  slot_id: string | null;
  service_id: string;
  status: BookingStatus;
  is_home_service: boolean;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  deposit_amount: number;
  total_amount: number | null;
  qr_token: string;
  created_at: string;
  updated_at: string;
  astrapay_ref?: string | null; // deposit payment referenceNo (0004_astrapay.sql)
}

export interface Sparepart {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  price: number;
  install_fee: number; // added when installed at the selling workshop; set via Workshop app
  workshop_id: string | null; // seller
  image_url: string | null;
  compatible_models: string[];
}

/** Sparepart row joined with its seller workshop name (marketplace listing). */
export interface SparepartListing extends Sparepart {
  seller_name: string | null;
}

export interface MotoScore {
  user_id: string;
  score: number;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  booking_id: string | null;
  type: PaymentType;
  amount: number;
  status: string;
  created_at: string;
  // AstraPay reconciliation (0004_astrapay.sql).
  astrapay_ref?: string | null; // AstraPay referenceNo
  astrapay_partner_ref?: string | null; // our partnerReferenceNo
  astrapay_settled_at?: string | null; // stamped by the notification webhook
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

// ── Ride tracking (mirrors supabase/migrations/0003_rides.sql) ──────────────
export interface LatLng {
  lat: number;
  lng: number;
}

export type RideSource = 'gps' | 'simulated';
export type RideStatus = 'active' | 'completed' | 'discarded';
/** Output of the motion classifier (speed + cadence + vibration + lean). */
export type RideActivity = 'motorcycle' | 'walking' | 'running' | 'vehicle' | 'unknown';
export type RideEventType = 'harsh_brake' | 'harsh_accel' | 'sharp_lean' | 'overspeed' | 'idle';

export interface Ride {
  id: string;
  user_id: string;
  motorcycle_id: string;
  source: RideSource;
  status: RideStatus;
  started_at: string;
  ended_at: string | null;
  distance_m: number; // server-validated, never client-claimed
  duration_s: number;
  avg_kmh: number;
  max_kmh: number;
  eco_score: number | null;
  harsh_events: number;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
}

export interface RidePoint {
  id: number;
  ride_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  altitude_m: number | null;
  mocked: boolean;
  activity: RideActivity | null;
}

export interface RideEvent {
  id: string;
  ride_id: string;
  ts: string;
  type: RideEventType;
  value: number | null;
  lat: number | null;
  lng: number | null;
}

// Console view rows
export interface KpiOverview {
  active_users: number;
  bookings_today: number;
  gmv: number;
  partner_workshops: number;
}

export interface MotoScoreBucket {
  bucket: number;
  bucket_min: number;
  n: number;
}

export interface RevenueBreakdown {
  type: PaymentType;
  total: number;
}

export interface BookingRecent {
  id: string;
  created_at: string;
  status: BookingStatus;
  total_amount: number | null;
  customer: string;
  plate: string;
  workshop: string;
  service: string;
}

// Ride row joined with owner + bike, as the console ride monitor / copilot read it.
// `users`/`motorcycles` are Supabase nested-select shapes (single related row).
export interface RideJoined extends Ride {
  users: { name: string } | null;
  motorcycles: { plate: string; model: string } | null;
}

/** A normalized event for the Console live-ops feed — one shape across sources. */
export type ActivityKind = 'booking' | 'ride' | 'score' | 'payment' | 'notification';
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string; // ISO timestamp
  title: string;
  detail: string;
  amount?: number | null; // rupiah, when monetary
  tone?: 'primary' | 'accent' | 'warning' | 'danger';
  app?: 'consumer' | 'partner' | 'system'; // which connected app originated it
}
