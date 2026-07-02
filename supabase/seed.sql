-- uMotor seed. Contract: docs/00-Architecture-Shared.md §8.
-- All dates relative to current_date so seeds never go stale.
-- Fixed UUIDs must match packages/shared/src/constants.ts.

-- ═══ Demo entities (the live flow) ═══════════════════════════════════

-- Demo user = the real AstraPay sandbox account (login binds this number; the
-- balance mirrors the funded sandbox wallet Rp 1.5jt). Bikes/score/bills below
-- stay uMotor's own data — AstraPay only holds the wallet.
insert into users (id, name, phone, astrapay_balance) values
  ('11111111-1111-1111-1111-111111111111', 'Yanuar Fajar Pratama', '0853-4886-1424', 1500000);

-- Bike 1 (first in garage) = Aerox, the hero carrying the maintenance story.
-- Bike 2 = Vario 160, healthy. UUIDs unchanged from earlier seeds; only the
-- model each id represents was swapped, so all hero FK wiring stays attached.
insert into motorcycles (id, user_id, plate, brand, model, year, odometer_km, avg_consumption_kml) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'D 4821 BJK', 'Yamaha', 'Aerox 155', 2023, 24000, 45),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   'D 2871 KCE', 'Honda', 'Vario 160', 2022, 18500, 45);

-- Aerox (hero, bike 333…): oil at exactly 80% used (2.400/3.000 km) — drives the
-- demo notification. All other components < 50% used.
insert into components (motorcycle_id, type, interval_km, last_service_km) values
  ('33333333-3333-3333-3333-333333333333', 'oil',        3000,  21600),
  ('33333333-3333-3333-3333-333333333333', 'tire',       20000, 15000),
  ('33333333-3333-3333-3333-333333333333', 'battery',    15000, 17000),
  ('33333333-3333-3333-3333-333333333333', 'brake_pad',  12000, 19000),
  ('33333333-3333-3333-3333-333333333333', 'air_filter', 16000, 17000),
  ('44444444-4444-4444-4444-444444444444', 'oil',        3000,  17500),
  ('44444444-4444-4444-4444-444444444444', 'tire',       20000, 10000),
  ('44444444-4444-4444-4444-444444444444', 'battery',    15000, 12000),
  ('44444444-4444-4444-4444-444444444444', 'brake_pad',  12000, 14000),
  ('44444444-4444-4444-4444-444444444444', 'air_filter', 16000, 11000);

-- Featured workshops (the 5 the consumer browses)
insert into workshops (id, name, type, tier, rating, address, lat, lng, distance_km,
                       price_estimate_min, price_estimate_max,
                       home_service, home_service_radius_km, home_service_fee) values
  ('22222222-2222-2222-2222-222222222222', 'AHASS Bandung Timur', 'ahass', 'premium', 4.8,
   'Jl. A.H. Nasution No. 105, Bandung', -6.9147, 107.6722, 1.2, 50000, 150000, false, null, null),
  (gen_random_uuid(), 'AHASS Kiaracondong', 'ahass', 'basic', 4.6,
   'Jl. Kiaracondong No. 88, Bandung', -6.9277, 107.6465, 2.4, 50000, 140000, false, null, null),
  (gen_random_uuid(), 'Bengkel Jaya Motor', 'independent', 'basic', 4.5,
   'Jl. Gatot Subroto No. 12, Bandung', -6.9250, 107.6300, 3.1, 35000, 100000, true, 10, 35000),
  (gen_random_uuid(), 'Sumber Rejeki Motor', 'independent', 'basic', 4.3,
   'Jl. Soekarno-Hatta No. 450, Bandung', -6.9380, 107.6510, 4.0, 30000, 90000, true, 10, 30000),
  (gen_random_uuid(), 'AHASS Antapani', 'ahass', 'premium', 4.7,
   'Jl. Terusan Jakarta No. 22, Bandung', -6.9135, 107.6600, 4.8, 50000, 150000, false, null, null);

-- Services. oil_change base 0: demo total must equal parts (65k + 18k = Rp 83.000).
insert into services (code, name, duration_min, base_price) values
  ('oil_change',   'Ganti oli',     30, 0),
  ('tune_up',      'Tune-up',       90, 100000),
  ('battery_swap', 'Ganti aki',     45, 50000),
  ('pasang_sparepart', 'Pasang sparepart', 30, 0); -- marketplace "Pasang di bengkel" orders

-- Slots: next 7 days, 09:00–16:00 hourly, for the 5 featured workshops.
insert into slots (workshop_id, slot_at, capacity)
select w.id,
       (current_date + d)::timestamp + make_interval(hours => h),
       1 + (h % 2)
from (select id from workshops order by created_at limit 5) w
cross join generate_series(0, 6) d
cross join generate_series(9, 16) h;

-- Spareparts: each has a seller workshop + install fee (added on "Pasang di bengkel").
-- install_fee is per-part and will later be editable in the Workshop app.
-- Yamalube + Filter oli are both sold by AHASS Bandung Timur (the scripted recommendation).
insert into spareparts (name, brand, category, price, install_fee, workshop_id, compatible_models)
select v.name, v.brand, v.category, v.price, v.install_fee,
       (select id from workshops where name = v.seller),
       v.models
from (values
  ('Yamalube 10W-30 0.8L',   'Yamaha',         'oil',       65000,  10000, 'AHASS Bandung Timur', array['Vario 160','NMAX 155','Aerox 155']),
  ('Filter oli',             'Astra Otoparts', 'filter',    18000,  10000, 'AHASS Bandung Timur', array['Vario 160','NMAX 155','Aerox 155','PCX 160']),
  ('AHM Oil MPX-2 0.8L',     'Honda',          'oil',       58000,  10000, 'AHASS Kiaracondong',  array['Vario 160','BeAT','PCX 160']),
  ('Aki GTZ6V',              'GS Astra',       'battery',   235000, 25000, 'AHASS Bandung Timur', array['Vario 160','BeAT']),
  ('Aki GTZ7V',              'GS Astra',       'battery',   265000, 25000, 'AHASS Antapani',      array['NMAX 155','Aerox 155','PCX 160']),
  ('Kampas rem depan',       'Astra Otoparts', 'brake',     45000,  30000, 'Bengkel Jaya Motor',  array['Vario 160','NMAX 155']),
  ('Ban tubeless 100/80-14', 'FDR',            'tire',      210000, 35000, 'Bengkel Jaya Motor',  array['Vario 160','BeAT']),
  ('Ban tubeless 110/70-13', 'FDR',            'tire',      245000, 35000, 'Sumber Rejeki Motor', array['NMAX 155','Aerox 155']),
  ('Filter udara',           'Astra Otoparts', 'filter',    52000,  10000, 'AHASS Bandung Timur', array['Vario 160','NMAX 155']),
  ('Windshield sport',       'Generic',        'accessory', 150000, 20000, 'AHASS Antapani',      array['NMAX 155','Aerox 155','PCX 160'])
) as v(name, brand, category, price, install_fee, seller, models);

-- MotoScore: Yanuar at 720 with history
insert into motoscore (user_id, score) values
  ('11111111-1111-1111-1111-111111111111', 720);
insert into motoscore_history (user_id, delta, reason, created_at) values
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '80 days'),
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '50 days'),
  ('11111111-1111-1111-1111-111111111111', 10, 'Bayar STNK tepat waktu',       now() - interval '35 days'),
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '20 days'),
  ('11111111-1111-1111-1111-111111111111', -5, 'Servis terlambat (oli 110%)',  now() - interval '8 days');

-- Points: Yanuar at 2.350
insert into points (user_id, balance) values
  ('11111111-1111-1111-1111-111111111111', 2350);
insert into points_history (user_id, delta, reason, created_at) values
  ('11111111-1111-1111-1111-111111111111', 500, 'Servis selesai',        now() - interval '50 days'),
  ('11111111-1111-1111-1111-111111111111', 850, 'Referral teman',        now() - interval '40 days'),
  ('11111111-1111-1111-1111-111111111111', 500, 'Servis selesai',        now() - interval '20 days'),
  ('11111111-1111-1111-1111-111111111111', 500, 'Bayar STNK via uMotor', now() - interval '15 days');

-- Bills (Finance Hub)
insert into bills (user_id, motorcycle_id, type, name, amount, due_date) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   'stnk', 'Pajak STNK D 4821 BJK', 230000, current_date + 20),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'stnk', 'Pajak STNK D 2871 KCE', 265000, current_date + 95),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'installment', 'Cicilan Vario — FIFGROUP', 1150000, current_date + 12);

-- Notifications inbox — mix of unread (top) and read (history) so the tab
-- is populated for the demo. Dates are relative to now() to stay fresh.
insert into notifications (user_id, type, title, body, read, created_at) values
  -- Unread — top of the list
  ('11111111-1111-1111-1111-111111111111', 'maintenance',
   'Waktunya ganti oli',
   'Oli motor D 4821 BJK sudah 80% interval (2.400/3.000 km), masih 600 km lagi. Ganti sekarang atau tunggu?',
   false, now() - interval '2 hours'),
  ('11111111-1111-1111-1111-111111111111', 'promo',
   'Promo servis akhir pekan',
   'Diskon 15% ganti oli + tune-up di AHASS Bandung Timur, berlaku sampai Minggu ini. Klaim di aplikasi.',
   false, now() - interval '8 hours'),
  ('11111111-1111-1111-1111-111111111111', 'reminder',
   'Cicilan Vario segera jatuh tempo',
   'Cicilan FIFGROUP untuk D 2871 KCE (Rp 1.150.000) jatuh tempo 12 hari lagi. Bayar sekarang via Finance Hub.',
   false, now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111', 'bill',
   'Pajak STNK mendekat',
   'Pajak STNK D 4821 BJK (Rp 230.000) jatuh tempo dalam 20 hari. Bayar via uMotor dapat +500 MotoPoints.',
   false, now() - interval '2 days'),
  -- Read — historical context
  ('11111111-1111-1111-1111-111111111111', 'ride',
   'Ride selesai — 18 km',
   'Jarak 18 km, skor eco 88. +180 MotoPoin. Odometer & jadwal servis ikut terupdate.',
   true, now() - interval '4 days'),
  ('11111111-1111-1111-1111-111111111111', 'score',
   'MotoScore naik ke 92',
   'Servis rutin tepat waktu menjaga skor kamu tetap tinggi. Terus pertahankan, ya!',
   true, now() - interval '18 days'),
  ('11111111-1111-1111-1111-111111111111', 'payment',
   'Top-up wallet berhasil',
   'Saldo uMotor bertambah Rp 200.000 via AstraPay. Siap dipakai untuk servis & tagihan.',
   true, now() - interval '25 days'),
  ('11111111-1111-1111-1111-111111111111', 'reward',
   'MotoPoints kamu bisa ditukar',
   'Kamu punya cukup poin untuk voucher servis Rp 50.000. Cek katalog di tab Finance.',
   true, now() - interval '32 days');

-- ═══ Demo user service history (so no consumer screen is ever empty) ════
-- Yanuar's past services across both bikes — fills bike detail "Riwayat servis",
-- the Booking tab, and (for jobs at AHASS Bandung Timur) the Partner earnings
-- list with a real customer name. Dates relative to now() so they never stale.
-- Does NOT touch components.last_service_km, so the 80%-oil demo state holds.
insert into bookings (user_id, motorcycle_id, workshop_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  v.bike::uuid,
  (select id from workshops where name = v.workshop),
  (select id from services where code = v.svc),
  'completed'::booking_status,
  v.total, 25000,
  now() - make_interval(days => v.days_ago),
  now() - make_interval(days => v.days_ago) + interval '3 hours'
from (values
  ('33333333-3333-3333-3333-333333333333', 'AHASS Bandung Timur', 'oil_change',     83000,  18),
  ('33333333-3333-3333-3333-333333333333', 'AHASS Bandung Timur', 'tune_up',       175000,  78),
  ('33333333-3333-3333-3333-333333333333', 'AHASS Kiaracondong',  'oil_change',     78000, 160),
  ('33333333-3333-3333-3333-333333333333', 'AHASS Bandung Timur', 'oil_change',     83000, 250),
  ('44444444-4444-4444-4444-444444444444', 'AHASS Bandung Timur', 'oil_change',     90000,  42),
  ('44444444-4444-4444-4444-444444444444', 'AHASS Bandung Timur', 'battery_swap',  315000, 130),
  ('44444444-4444-4444-4444-444444444444', 'Bengkel Jaya Motor',  'oil_change',     72000, 215)
) as v(bike, workshop, svc, total, days_ago);

-- One upcoming confirmed booking so the consumer Booking tab and the Partner
-- inbox aren't empty at rest (the live demo adds another booking on top).
with picked as (
  select id from slots
  where workshop_id = '22222222-2222-2222-2222-222222222222'
    and slot_at > now() + interval '20 hours'
  order by slot_at limit 1
)
insert into bookings (user_id, motorcycle_id, workshop_id, slot_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  '44444444-4444-4444-4444-444444444444'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  picked.id,
  (select id from services where code = 'oil_change'),
  'confirmed'::booking_status,
  90000, 25000, now() - interval '5 hours', now() - interval '5 hours'
from picked;

update slots set booked_count = booked_count + 1
where id = (
  select id from slots
  where workshop_id = '22222222-2222-2222-2222-222222222222'
    and slot_at > now() + interval '20 hours'
  order by slot_at limit 1
);

-- Yamalube + Filter oli (= Rp 83.000) attached to the oil changes.
insert into booking_parts (booking_id, sparepart_id, qty, unit_price)
select b.id, s.id, 1, s.price
from bookings b
join spareparts s on s.name in ('Yamalube 10W-30 0.8L', 'Filter oli')
where b.user_id = '11111111-1111-1111-1111-111111111111'
  and b.motorcycle_id = '33333333-3333-3333-3333-333333333333'
  and b.status = 'completed'
  and b.total_amount = 83000;

-- Payments for Yanuar's history (the volume payments block below excludes him).
insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'deposit', deposit_amount, created_at
from bookings
where user_id = '11111111-1111-1111-1111-111111111111' and status <> 'cancelled';
insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'final', greatest(0, coalesce(total_amount, 0) - deposit_amount), updated_at
from bookings
where user_id = '11111111-1111-1111-1111-111111111111' and status = 'completed';

-- ═══ Console volume (charts must look alive) ═════════════════════════

-- ~45 more workshops (50 total)
insert into workshops (name, type, tier, rating, address, lat, lng, distance_km,
                       price_estimate_min, price_estimate_max, home_service)
select
  'Bengkel Motor ' || i,
  case when i % 3 = 0 then 'ahass'::workshop_type else 'independent'::workshop_type end,
  case when i % 5 = 0 then 'premium'::workshop_tier else 'basic'::workshop_tier end,
  round((3.8 + random() * 1.2)::numeric, 1),
  'Bandung Raya',
  -6.91 + (random() - 0.5) * 0.2,
  107.61 + (random() - 0.5) * 0.2,
  round((1 + random() * 14)::numeric, 1),
  30000, 120000,
  i % 4 = 0
from generate_series(1, 45) i;

-- ~999 volume users (1.000 total), each with one bike
insert into users (name, astrapay_balance)
select 'User ' || i, (50000 + floor(random() * 450000))::int
from generate_series(1, 999) i;

insert into motorcycles (user_id, plate, brand, model, year, odometer_km)
select u.id,
       'D ' || (1000 + row_number() over ()) || ' ' ||
         chr(65 + (random() * 25)::int) || chr(65 + (random() * 25)::int) ||
         chr(65 + (random() * 25)::int),
       case when random() < 0.6 then 'Honda' else 'Yamaha' end,
       (array['Vario 160','BeAT','PCX 160','NMAX 155','Aerox 155'])[1 + floor(random() * 5)::int],
       2018 + floor(random() * 8)::int,
       floor(random() * 60000)::int
from users u
where u.id <> '11111111-1111-1111-1111-111111111111';

-- MotoScore distribution ~ normal around 650 (sum of uniforms), clamped 300–850
insert into motoscore (user_id, score)
select u.id,
       least(850, greatest(300,
         round(650 + (random() + random() + random() + random() - 2) * 120)))::int
from users u
where u.id <> '11111111-1111-1111-1111-111111111111';

-- ~300 bookings over the last 30 days, mixed statuses
with sample as (
  select m.id as motorcycle_id, m.user_id
  from motorcycles m
  where m.user_id <> '11111111-1111-1111-1111-111111111111'
  order by random()
  limit 300
),
ws as (select array_agg(id) as ids from workshops),
svc as (select array_agg(id) as ids from services)
insert into bookings (user_id, motorcycle_id, workshop_id, service_id, status,
                      total_amount, created_at, updated_at)
select
  s.user_id,
  s.motorcycle_id,
  ws.ids[1 + floor(random() * cardinality(ws.ids))::int],
  svc.ids[1 + floor(random() * cardinality(svc.ids))::int],
  case
    when r < 0.60 then 'completed'::booking_status
    when r < 0.75 then 'confirmed'::booking_status
    when r < 0.85 then 'pending'::booking_status
    when r < 0.95 then 'cancelled'::booking_status
    else 'checked_in'::booking_status
  end,
  (50000 + floor(random() * 200000))::int,
  ts, ts
from sample s
cross join ws
cross join svc
cross join lateral (select random() as r,
                           now() - random() * interval '30 days' as ts) x;

-- ═══ Demo workshop volume (Partner dashboard/earnings/queue look alive) ══
-- ~22 completed jobs at AHASS Bandung Timur over the last 7 days; the first 6
-- land "today" so Pendapatan hari ini & dashboard "Selesai hari ini" are > 0.
with vol as (
  select u.id as user_id,
         (select m.id from motorcycles m where m.user_id = u.id limit 1) as motorcycle_id,
         (row_number() over ())::int as rn
  from users u
  where u.id <> '11111111-1111-1111-1111-111111111111'
  order by random() limit 22
),
svc as (select array_agg(id) as ids from services where code <> 'pasang_sparepart')
insert into bookings (user_id, motorcycle_id, workshop_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select
  v.user_id, v.motorcycle_id, '22222222-2222-2222-2222-222222222222'::uuid,
  svc.ids[1 + floor(random() * cardinality(svc.ids))::int],
  'completed'::booking_status,
  (60000 + floor(random() * 200000))::int, 25000,
  case when v.rn <= 6 then date_trunc('day', now()) + make_interval(hours => 8 + v.rn)
       else now() - make_interval(days => (v.rn % 6) + 1) end,
  case when v.rn <= 6 then date_trunc('day', now()) + make_interval(hours => 8 + v.rn, mins => 80)
       else now() - make_interval(days => (v.rn % 6) + 1) + interval '2 hours' end
from vol v cross join svc;

-- A few live jobs on today's slots so the Antrian (queue) is populated.
with today_slots as (
  select id, (row_number() over (order by slot_at))::int as rn
  from slots
  where workshop_id = '22222222-2222-2222-2222-222222222222'
    and slot_at::date = current_date
),
pick as (
  select u.id as user_id,
         (select m.id from motorcycles m where m.user_id = u.id limit 1) as motorcycle_id,
         (row_number() over ())::int as rn
  from users u where u.id <> '11111111-1111-1111-1111-111111111111' order by random() limit 3
)
insert into bookings (user_id, motorcycle_id, workshop_id, slot_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select p.user_id, p.motorcycle_id, '22222222-2222-2222-2222-222222222222'::uuid, t.id,
  (select id from services where code = 'oil_change'),
  (array['confirmed','checked_in','in_progress'])[p.rn]::booking_status,
  (70000 + p.rn * 15000), 25000, now() - interval '2 hours', now() - interval '90 minutes'
from pick p join today_slots t on t.rn = p.rn;

update slots set booked_count = booked_count + 1
where id in (
  select id from (
    select id, row_number() over (order by slot_at) rn
    from slots where workshop_id = '22222222-2222-2222-2222-222222222222'
      and slot_at::date = current_date
  ) s where rn <= 3
);

-- Payments backing the volume bookings (deposit for all non-cancelled, final for completed)
insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'deposit', deposit_amount, created_at
from bookings where status <> 'cancelled' and user_id <> '11111111-1111-1111-1111-111111111111';

insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'final', greatest(0, coalesce(total_amount, 0) - deposit_amount),
       created_at + interval '3 hours'
from bookings where status = 'completed' and user_id <> '11111111-1111-1111-1111-111111111111';

-- ═══ Ride tracking demo data ═════════════════════════════════════════
-- One "hero" ride carries a real route the summary screen draws on the SVG map;
-- two more give the history list body. Stats stored directly (these are already
-- finalized — finish_ride only runs for live/simulated rides during the demo).
insert into rides (id, user_id, motorcycle_id, source, status, started_at, ended_at,
                   distance_m, duration_s, avg_kmh, max_kmh, eco_score, harsh_events) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'gps', 'completed',
   now() - interval '2 days', now() - interval '2 days' + interval '28 minutes',
   12400, 1680, 26.6, 58.0, 92, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'gps', 'completed',
   now() - interval '1 day', now() - interval '1 day' + interval '15 minutes',
   6200, 900, 24.8, 47.0, 96, 0),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444444', 'gps', 'completed',
   now() - interval '3 days', now() - interval '3 days' + interval '35 minutes',
   18900, 2100, 32.4, 71.0, 81, 3);

-- Hero-ride route: a recognizable loop around east Bandung (~120 s between fixes).
insert into ride_points (ride_id, ts, lat, lng, accuracy_m, speed_mps, activity)
select 'aaaaaaaa-0000-0000-0000-000000000001',
       (now() - interval '2 days') + make_interval(secs => p.idx * 120),
       p.lat, p.lng, p.acc, p.spd, 'motorcycle'
from (values
  (0,  -6.9147, 107.6722, 8,  0.0),
  (1,  -6.9131, 107.6760, 7,  11.5),
  (2,  -6.9100, 107.6795, 6,  13.2),
  (3,  -6.9072, 107.6831, 9,  12.0),
  (4,  -6.9040, 107.6858, 7,  14.8),
  (5,  -6.9012, 107.6829, 8,  10.4),
  (6,  -6.8995, 107.6788, 6,  9.1),
  (7,  -6.9020, 107.6749, 7,  12.7),
  (8,  -6.9058, 107.6717, 8,  15.3),
  (9,  -6.9090, 107.6688, 9,  13.9),
  (10, -6.9122, 107.6669, 7,  11.2),
  (11, -6.9150, 107.6693, 6,  8.6),
  (12, -6.9152, 107.6722, 8,  4.0)
) as p(idx, lat, lng, acc, spd);

insert into ride_events (ride_id, ts, type, value, lat, lng) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   (now() - interval '2 days') + interval '11 minutes', 'harsh_brake', 4.2, -6.9040, 107.6858);

-- ═══ Partner "lively demo" seed ══════════════════════════════════════
-- Named customers + a variety of bookings all anchored to the demo workshop
-- (AHASS Bandung Timur, 22222…) so the Partner tabs — Inbox, Antrian,
-- Pesanan (marketplace), Pendapatan, Dashboard — show populated content on
-- first launch. Timestamps relative to now(); payments inserted explicitly so
-- earnings totals include these rows.

insert into users (id, name, phone, astrapay_balance) values
  ('55555555-0000-0000-0000-000000000001', 'Rizky Ramadhan',   '0812-3400-0001', 320000),
  ('55555555-0000-0000-0000-000000000002', 'Dewi Anggraini',   '0812-3400-0002', 180000),
  ('55555555-0000-0000-0000-000000000003', 'Bagas Pramudita',  '0812-3400-0003', 450000),
  ('55555555-0000-0000-0000-000000000004', 'Sari Wulandari',   '0812-3400-0004', 260000),
  ('55555555-0000-0000-0000-000000000005', 'Farhan Nugroho',   '0812-3400-0005', 500000),
  ('55555555-0000-0000-0000-000000000006', 'Intan Permata',    '0812-3400-0006', 210000),
  ('55555555-0000-0000-0000-000000000007', 'Aditya Wibowo',    '0812-3400-0007', 380000),
  ('55555555-0000-0000-0000-000000000008', 'Nadia Salsabila',  '0812-3400-0008', 150000),
  ('55555555-0000-0000-0000-000000000009', 'Reza Kurniawan',   '0812-3400-0009', 275000),
  ('55555555-0000-0000-0000-000000000010', 'Putri Maharani',   '0812-3400-0010', 340000),
  ('55555555-0000-0000-0000-000000000011', 'Hendra Setiawan',  '0812-3400-0011', 420000),
  ('55555555-0000-0000-0000-000000000012', 'Kirana Ayu',       '0812-3400-0012', 190000);

insert into motorcycles (id, user_id, plate, brand, model, year, odometer_km) values
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'D 1234 RZK', 'Yamaha', 'NMAX 155',  2022,  9800),
  ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'D 2345 DWI', 'Honda',  'Vario 160', 2023,  6200),
  ('66666666-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003', 'D 3456 BGS', 'Yamaha', 'Aerox 155', 2024,  3100),
  ('66666666-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000004', 'D 4567 SWL', 'Honda',  'BeAT',      2021, 14500),
  ('66666666-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000005', 'D 5678 FRN', 'Honda',  'PCX 160',   2023,  7400),
  ('66666666-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000006', 'D 6789 INT', 'Yamaha', 'NMAX 155',  2022, 11200),
  ('66666666-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000007', 'D 7890 ADT', 'Honda',  'Vario 160', 2024,  2800),
  ('66666666-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000008', 'D 8901 NDA', 'Yamaha', 'Aerox 155', 2023,  5900),
  ('66666666-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000009', 'D 9012 RZK', 'Honda',  'BeAT',      2022, 16700),
  ('66666666-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000010', 'D 0123 PTR', 'Honda',  'PCX 160',   2024,  4300),
  ('66666666-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000011', 'D 1122 HDR', 'Yamaha', 'NMAX 155',  2021, 18900),
  ('66666666-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000012', 'D 3344 KRN', 'Honda',  'Vario 160', 2023,  8600);

-- Give the named customers plausible MotoScores so Console tables aren't
-- flooded with the 600 default when Yanuar isn't the focus.
insert into motoscore (user_id, score)
select id, 620 + floor(random() * 180)::int
from users where id::text like '55555555-0000-0000-0000-%';

-- ── Inbox: 4 pending bookings on tomorrow's slots at the demo workshop ──
with pending_slots as (
  select id, (row_number() over (order by slot_at))::int as rn
  from slots
  where workshop_id = '22222222-2222-2222-2222-222222222222'
    and slot_at::date = current_date + 1
)
insert into bookings (user_id, motorcycle_id, workshop_id, slot_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select p.uid::uuid, p.mid::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
       s.id,
       (select id from services where code = p.svc),
       'pending'::booking_status,
       p.total, 25000,
       now() - make_interval(mins => p.mins_ago),
       now() - make_interval(mins => p.mins_ago)
from (values
  ('55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'oil_change',     85000,  12, 1),
  ('55555555-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', 'tune_up',       165000,  34, 2),
  ('55555555-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003', 'oil_change',     95000,  58, 3),
  ('55555555-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004', 'battery_swap',  305000, 120, 4)
) as p(uid, mid, svc, total, mins_ago, slot_rn)
join pending_slots s on s.rn = p.slot_rn;

update slots set booked_count = booked_count + 1
where id in (
  select id from (
    select id, row_number() over (order by slot_at) rn
    from slots where workshop_id = '22222222-2222-2222-2222-222222222222'
      and slot_at::date = current_date + 1
  ) x where rn between 1 and 4
);

-- One pending home-service booking so the "Home / Layanan" badge shows up.
insert into bookings (user_id, motorcycle_id, workshop_id, service_id, status,
                      is_home_service, home_address, home_lat, home_lng,
                      total_amount, deposit_amount, created_at, updated_at)
values (
  '55555555-0000-0000-0000-000000000005'::uuid,
  '66666666-0000-0000-0000-000000000005'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  (select id from services where code = 'oil_change'),
  'pending'::booking_status, true, 'Jl. Riau No. 45, Bandung',
  -6.9070, 107.6110, 110000, 35000,
  now() - interval '18 minutes', now() - interval '18 minutes'
);

-- ── Queue (Antrian): 5 more active jobs on today's remaining slots ────
-- Today's slots rn 1..3 are already occupied by the existing seed. Take rn 4..8.
with today_slots as (
  select id, (row_number() over (order by slot_at))::int as rn
  from slots
  where workshop_id = '22222222-2222-2222-2222-222222222222'
    and slot_at::date = current_date
)
insert into bookings (user_id, motorcycle_id, workshop_id, slot_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select p.uid::uuid, p.mid::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
       t.id,
       (select id from services where code = p.svc),
       p.status::booking_status,
       p.total, 25000,
       now() - make_interval(mins => p.mins_ago),
       now() - make_interval(mins => p.status_age)
from (values
  ('55555555-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000006', 'oil_change',     88000, 'in_progress', 240, 25, 4),
  ('55555555-0000-0000-0000-000000000007', '66666666-0000-0000-0000-000000000007', 'tune_up',       175000, 'checked_in',  180, 40, 5),
  ('55555555-0000-0000-0000-000000000008', '66666666-0000-0000-0000-000000000008', 'oil_change',     95000, 'checked_in',  120, 55, 6),
  ('55555555-0000-0000-0000-000000000009', '66666666-0000-0000-0000-000000000009', 'battery_swap',  315000, 'confirmed',    80, 80, 7),
  ('55555555-0000-0000-0000-000000000010', '66666666-0000-0000-0000-000000000010', 'oil_change',     98000, 'confirmed',    45, 45, 8)
) as p(uid, mid, svc, total, status, mins_ago, status_age, slot_rn)
join today_slots t on t.rn = p.slot_rn;

update slots set booked_count = booked_count + 1
where id in (
  select id from (
    select id, row_number() over (order by slot_at) rn
    from slots where workshop_id = '22222222-2222-2222-2222-222222222222'
      and slot_at::date = current_date
  ) x where rn between 4 and 8
);

-- ── Marketplace orders (Pesanan pemasangan tab) ───────────────────────
-- pasang_sparepart bookings with booking_parts. Mix of pending / confirmed /
-- completed so the tab shows both live work and history.
insert into bookings (id, user_id, motorcycle_id, workshop_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at) values
  ('77777777-0000-0000-0000-000000000001',
   '55555555-0000-0000-0000-000000000011', '66666666-0000-0000-0000-000000000011',
   '22222222-2222-2222-2222-222222222222',
   (select id from services where code = 'pasang_sparepart'),
   'pending', 83000, 25000, now() - interval '35 minutes', now() - interval '35 minutes'),
  ('77777777-0000-0000-0000-000000000002',
   '55555555-0000-0000-0000-000000000012', '66666666-0000-0000-0000-000000000012',
   '22222222-2222-2222-2222-222222222222',
   (select id from services where code = 'pasang_sparepart'),
   'pending', 52000, 25000, now() - interval '1 hour 10 minutes', now() - interval '1 hour 10 minutes'),
  ('77777777-0000-0000-0000-000000000003',
   '55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   (select id from services where code = 'pasang_sparepart'),
   'confirmed', 235000, 25000, now() - interval '3 hours', now() - interval '2 hours'),
  ('77777777-0000-0000-0000-000000000004',
   '55555555-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000006',
   '22222222-2222-2222-2222-222222222222',
   (select id from services where code = 'pasang_sparepart'),
   'completed', 83000, 25000, now() - interval '1 day', now() - interval '1 day' + interval '2 hours'),
  ('77777777-0000-0000-0000-000000000005',
   '55555555-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222',
   (select id from services where code = 'pasang_sparepart'),
   'completed', 52000, 25000, now() - interval '3 days', now() - interval '3 days' + interval '90 minutes');

insert into booking_parts (booking_id, sparepart_id, qty, unit_price) values
  ('77777777-0000-0000-0000-000000000001',
   (select id from spareparts where name = 'Yamalube 10W-30 0.8L'), 1, 65000),
  ('77777777-0000-0000-0000-000000000001',
   (select id from spareparts where name = 'Filter oli'),           1, 18000),
  ('77777777-0000-0000-0000-000000000002',
   (select id from spareparts where name = 'Filter udara'),         1, 52000),
  ('77777777-0000-0000-0000-000000000003',
   (select id from spareparts where name = 'Aki GTZ6V'),            1, 235000),
  ('77777777-0000-0000-0000-000000000004',
   (select id from spareparts where name = 'Yamalube 10W-30 0.8L'), 1, 65000),
  ('77777777-0000-0000-0000-000000000004',
   (select id from spareparts where name = 'Filter oli'),           1, 18000),
  ('77777777-0000-0000-0000-000000000005',
   (select id from spareparts where name = 'Filter udara'),         1, 52000);

-- ── Extra completed jobs across the week (Dashboard bar chart body) ───
insert into bookings (user_id, motorcycle_id, workshop_id, service_id, status,
                      total_amount, deposit_amount, created_at, updated_at)
select p.uid::uuid, p.mid::uuid,
       '22222222-2222-2222-2222-222222222222'::uuid,
       (select id from services where code = p.svc),
       'completed'::booking_status,
       p.total, 25000,
       now() - make_interval(days => p.days_ago, hours => p.h_from),
       now() - make_interval(days => p.days_ago, hours => p.h_from) + interval '90 minutes'
from (values
  ('55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'oil_change',     85000, 0, 4),
  ('55555555-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', 'tune_up',       165000, 0, 6),
  ('55555555-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000005', 'oil_change',     90000, 1, 3),
  ('55555555-0000-0000-0000-000000000007', '66666666-0000-0000-0000-000000000007', 'battery_swap',  305000, 1, 7),
  ('55555555-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004', 'oil_change',     80000, 2, 4),
  ('55555555-0000-0000-0000-000000000008', '66666666-0000-0000-0000-000000000008', 'tune_up',       175000, 2, 8),
  ('55555555-0000-0000-0000-000000000011', '66666666-0000-0000-0000-000000000011', 'oil_change',     85000, 3, 5),
  ('55555555-0000-0000-0000-000000000012', '66666666-0000-0000-0000-000000000012', 'oil_change',     88000, 3, 9),
  ('55555555-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000006', 'tune_up',       170000, 4, 6),
  ('55555555-0000-0000-0000-000000000009', '66666666-0000-0000-0000-000000000009', 'battery_swap',  310000, 5, 7),
  ('55555555-0000-0000-0000-000000000010', '66666666-0000-0000-0000-000000000010', 'oil_change',     95000, 5, 4),
  ('55555555-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003', 'oil_change',     92000, 6, 5)
) as p(uid, mid, svc, total, days_ago, h_from);

-- Payments for all the new named-customer bookings so the earnings totals
-- (Pendapatan hari ini + Semua waktu + 7-day bars) reflect them.
insert into payments (user_id, booking_id, type, amount, created_at)
select b.user_id, b.id, 'deposit', b.deposit_amount, b.created_at
from bookings b
where b.workshop_id = '22222222-2222-2222-2222-222222222222'
  and b.user_id::text like '55555555-0000-0000-0000-%'
  and b.status <> 'cancelled';

insert into payments (user_id, booking_id, type, amount, created_at)
select b.user_id, b.id, 'final',
       greatest(0, coalesce(b.total_amount, 0) - b.deposit_amount),
       b.updated_at
from bookings b
where b.workshop_id = '22222222-2222-2222-2222-222222222222'
  and b.user_id::text like '55555555-0000-0000-0000-%'
  and b.status = 'completed';
