// Fixed UUIDs used by seed.sql and fake login. Must match seed exactly.
export const DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';
export const DEMO_WORKSHOP_ID = '22222222-2222-2222-2222-222222222222';
// Hero bike (carries the 80%-oil maintenance story) = the Aerox; the Vario is
// the healthy second bike. The UUIDs are unchanged from earlier seeds — only the
// model each id represents was swapped, so all hero FK wiring stays intact.
export const DEMO_BIKE_AEROX_ID = '33333333-3333-3333-3333-333333333333';
export const DEMO_BIKE_VARIO_ID = '44444444-4444-4444-4444-444444444444';

// Real AstraPay sandbox account (login binds this number; seed mirrors it).
export const DEMO_USER_PHONE = '0853-4886-1424';

export const DEPOSIT_AMOUNT = 25000; // Rp, per proposal
export const MOTOSCORE_SERVICE_DELTA = 5;
export const POINTS_PER_SERVICE = 500;

// Service code used for marketplace "Pasang di bengkel" install orders.
// Seeded in supabase/seed.sql; partner Sparepart-orders tab filters on it.
export const INSTALL_SERVICE_CODE = 'pasang_sparepart';

// Maintenance notification thresholds (pct of interval used)
export const NOTIFY_THRESHOLDS = [80, 95, 100] as const;

export const COMPONENT_LABELS: Record<string, string> = {
  oil: 'Oli mesin',
  tire: 'Ban',
  battery: 'Aki',
  brake_pad: 'Kampas rem',
  air_filter: 'Filter udara',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu konfirmasi',
  confirmed: 'Dikonfirmasi',
  checked_in: 'Check-in',
  in_progress: 'Dikerjakan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};
