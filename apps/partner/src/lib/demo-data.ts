import { DEMO_WORKSHOP_ID, type BookingStatus } from '@umotor/shared';
import { supabase } from './supabase';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const WORKING_HOURS = Array.from({ length: 9 }, (_, i) => i + 9); // 09:00–17:00

interface DemoPaymentRow {
  id: string;
  user_id: string;
  booking_id: string;
  type: 'deposit' | 'final';
  amount: number;
  status: string;
  created_at: string;
}

interface JakartaDay {
  key: string;
  startIso: string;
  endIso: string;
}

function jakartaDay(now: Date, offsetDays = 0): JakartaDay {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  const local = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + offsetDays),
  );
  const key = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const next = new Date(local);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return {
    key,
    startIso: new Date(`${key}T00:00:00+07:00`).toISOString(),
    endIso: new Date(`${nextKey}T00:00:00+07:00`).toISOString(),
  };
}

function atWorkingHour(dayKey: string, hour: number) {
  return new Date(`${dayKey}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString();
}

export function buildDemoWorkingSlots(now = new Date()) {
  return Array.from({ length: 5 }, (_, dayOffset) => jakartaDay(now, dayOffset)).flatMap((day) =>
    WORKING_HOURS.map((hour) => ({
      workshop_id: DEMO_WORKSHOP_ID,
      slot_at: atWorkingHour(day.key, hour),
      capacity: 3,
    })),
  );
}

function datedUuid(prefix: string, dayKey: string, group: string, index: number) {
  const day = dayKey.replaceAll('-', '');
  return `${prefix}-${day.slice(0, 4)}-${day.slice(4, 8)}-${group}-${String(index).padStart(12, '0')}`;
}

const DEMO_JOBS: Array<{
  userId: string;
  motorcycleId: string;
  service: 'oil_change' | 'tune_up' | 'battery_swap';
  status: BookingStatus;
  total: number;
  hour?: number;
  minutesAgo: number;
  home?: boolean;
}> = [
  { userId: '55555555-0000-0000-0000-000000000001', motorcycleId: '66666666-0000-0000-0000-000000000001', service: 'oil_change', status: 'pending', total: 85000, hour: 9, minutesAgo: 8 },
  { userId: '55555555-0000-0000-0000-000000000002', motorcycleId: '66666666-0000-0000-0000-000000000002', service: 'tune_up', status: 'pending', total: 165000, hour: 10, minutesAgo: 19 },
  { userId: '55555555-0000-0000-0000-000000000003', motorcycleId: '66666666-0000-0000-0000-000000000003', service: 'oil_change', status: 'pending', total: 95000, hour: 11, minutesAgo: 31 },
  { userId: '55555555-0000-0000-0000-000000000004', motorcycleId: '66666666-0000-0000-0000-000000000004', service: 'battery_swap', status: 'confirmed', total: 305000, hour: 12, minutesAgo: 55 },
  { userId: '55555555-0000-0000-0000-000000000005', motorcycleId: '66666666-0000-0000-0000-000000000005', service: 'oil_change', status: 'confirmed', total: 110000, hour: 13, minutesAgo: 75 },
  { userId: '55555555-0000-0000-0000-000000000006', motorcycleId: '66666666-0000-0000-0000-000000000006', service: 'oil_change', status: 'checked_in', total: 88000, hour: 14, minutesAgo: 110 },
  { userId: '55555555-0000-0000-0000-000000000007', motorcycleId: '66666666-0000-0000-0000-000000000007', service: 'tune_up', status: 'in_progress', total: 175000, hour: 15, minutesAgo: 145 },
  { userId: '55555555-0000-0000-0000-000000000008', motorcycleId: '66666666-0000-0000-0000-000000000008', service: 'oil_change', status: 'completed', total: 95000, hour: 16, minutesAgo: 210 },
  { userId: '55555555-0000-0000-0000-000000000009', motorcycleId: '66666666-0000-0000-0000-000000000009', service: 'battery_swap', status: 'completed', total: 315000, hour: 17, minutesAgo: 280 },
  { userId: '55555555-0000-0000-0000-000000000010', motorcycleId: '66666666-0000-0000-0000-000000000010', service: 'oil_change', status: 'pending', total: 125000, minutesAgo: 14, home: true },
];

/**
 * Idempotently refresh the default partner's demo-day schedule and activity.
 * IDs are derived from the Jakarta date, so reopening the app never duplicates
 * rows while a later demo day automatically gets fresh data.
 */
export async function ensureDemoWorkshopReady(now = new Date()) {
  const today = jakartaDay(now);
  const schedule = buildDemoWorkingSlots(now);
  const scheduleEnd = jakartaDay(now, 5).startIso;

  const { data: existingSlots, error: existingError } = await supabase
    .from('slots')
    .select('id, slot_at, booked_count')
    .eq('workshop_id', DEMO_WORKSHOP_ID)
    .gte('slot_at', today.startIso)
    .lt('slot_at', scheduleEnd);
  if (existingError) throw existingError;

  const offHours = (existingSlots ?? []).filter((slot) => {
    const local = new Date(new Date(slot.slot_at).getTime() + WIB_OFFSET_MS);
    return slot.booked_count === 0 && !WORKING_HOURS.includes(local.getUTCHours());
  });
  if (offHours.length > 0) {
    const { error } = await supabase.from('slots').delete().in('id', offHours.map((slot) => slot.id));
    if (error) throw error;
  }

  const { error: scheduleError } = await supabase
    .from('slots')
    .upsert(schedule, { onConflict: 'workshop_id,slot_at', ignoreDuplicates: true });
  if (scheduleError) throw scheduleError;
  const { error: capacityError } = await supabase
    .from('slots')
    .update({ capacity: 3 })
    .eq('workshop_id', DEMO_WORKSHOP_ID)
    .gte('slot_at', today.startIso)
    .lt('slot_at', scheduleEnd)
    .lt('capacity', 3);
  if (capacityError) throw capacityError;

  // Retire stale active work so old rehearsal rows don't inflate today's queue.
  const { data: activeRows, error: activeError } = await supabase
    .from('bookings')
    .select('id, created_at, slots(slot_at)')
    .eq('workshop_id', DEMO_WORKSHOP_ID)
    .in('status', ['pending', 'confirmed', 'checked_in', 'in_progress']);
  if (activeError) throw activeError;
  const staleIds = ((activeRows ?? []) as unknown as Array<{ id: string; created_at: string; slots: { slot_at: string } | null }>)
    .filter((row) =>
      new Date(row.created_at) < new Date(today.startIso) ||
      new Date(row.slots?.slot_at ?? row.created_at) < new Date(today.startIso),
    )
    .map((row) => row.id);
  if (staleIds.length > 0) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .in('id', staleIds);
    if (error) throw error;
  }

  const [{ data: services, error: servicesError }, { data: todaySlots, error: slotsError }] = await Promise.all([
    supabase.from('services').select('id, code').in('code', ['oil_change', 'tune_up', 'battery_swap']),
    supabase
      .from('slots')
      .select('id, slot_at')
      .eq('workshop_id', DEMO_WORKSHOP_ID)
      .gte('slot_at', today.startIso)
      .lt('slot_at', today.endIso),
  ]);
  if (servicesError) throw servicesError;
  if (slotsError) throw slotsError;

  const serviceIds = new Map((services ?? []).map((service) => [service.code, service.id]));
  const slotByHour = new Map(
    (todaySlots ?? []).map((slot) => {
      const local = new Date(new Date(slot.slot_at).getTime() + WIB_OFFSET_MS);
      return [local.getUTCHours(), slot] as const;
    }),
  );
  const dayStartMs = new Date(today.startIso).getTime();
  const bookingRows = DEMO_JOBS.map((job, i) => {
    const serviceId = serviceIds.get(job.service);
    const slot = job.hour == null ? null : slotByHour.get(job.hour);
    if (!serviceId || (job.hour != null && !slot)) throw new Error('Demo services or slots are incomplete.');
    const createdMs = Math.max(dayStartMs + 5 * 60_000, now.getTime() - job.minutesAgo * 60_000);
    const updatedMs = job.status === 'completed' ? Math.max(createdMs, now.getTime() - 20 * 60_000) : createdMs;
    return {
      id: datedUuid('88888888', today.key, '8000', i + 1),
      user_id: job.userId,
      motorcycle_id: job.motorcycleId,
      workshop_id: DEMO_WORKSHOP_ID,
      slot_id: slot?.id ?? null,
      service_id: serviceId,
      status: job.status,
      is_home_service: !!job.home,
      home_address: job.home ? 'Jl. Asia Afrika No. 25, Bandung' : null,
      home_lat: job.home ? -6.9217 : null,
      home_lng: job.home ? 107.6071 : null,
      total_amount: job.total,
      deposit_amount: 25000,
      created_at: new Date(createdMs).toISOString(),
      updated_at: new Date(updatedMs).toISOString(),
    };
  });

  const { error: bookingsError } = await supabase
    .from('bookings')
    // Merge the deterministic rows on every demo login so completed jobs keep
    // today's timestamps and the revenue screens never go stale overnight.
    .upsert(bookingRows, { onConflict: 'id' });
  if (bookingsError) throw bookingsError;

  const paymentRows = bookingRows.flatMap((booking, i): DemoPaymentRow[] => {
    const rows: DemoPaymentRow[] = [{
      id: datedUuid('99999999', today.key, '9000', i + 1),
      user_id: booking.user_id,
      booking_id: booking.id,
      type: 'deposit',
      amount: booking.deposit_amount,
      status: 'success',
      created_at: booking.created_at,
    }];
    if (booking.status === 'completed') {
      rows.push({
        id: datedUuid('99999999', today.key, '9000', 100 + i + 1),
        user_id: booking.user_id,
        booking_id: booking.id,
        type: 'final',
        amount: Math.max(0, booking.total_amount - booking.deposit_amount),
        status: 'success',
        created_at: booking.updated_at,
      });
    }
    return rows;
  });
  const { error: paymentsError } = await supabase
    .from('payments')
    .upsert(paymentRows, { onConflict: 'id' });
  if (paymentsError) throw paymentsError;

  const slotIds = (todaySlots ?? []).map((slot) => slot.id);
  const { data: bookedRows, error: bookedError } = await supabase
    .from('bookings')
    .select('slot_id, status')
    .in('slot_id', slotIds)
    .neq('status', 'cancelled');
  if (bookedError) throw bookedError;
  const counts = new Map<string, number>();
  for (const row of bookedRows ?? []) {
    if (row.slot_id) counts.set(row.slot_id, (counts.get(row.slot_id) ?? 0) + 1);
  }
  const countUpdates = await Promise.all(
    slotIds.map((id) => supabase.from('slots').update({ booked_count: counts.get(id) ?? 0 }).eq('id', id)),
  );
  const countError = countUpdates.find((result) => result.error)?.error;
  if (countError) throw countError;
}
