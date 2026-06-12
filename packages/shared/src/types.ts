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
}

export interface Sparepart {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  price: number;
  image_url: string | null;
  compatible_models: string[];
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
