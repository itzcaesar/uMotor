-- uMotor seed. Contract: docs/00-Architecture-Shared.md §8.
-- All dates relative to current_date so seeds never go stale.
-- Fixed UUIDs must match packages/shared/src/constants.ts.

-- ═══ Demo entities (the live flow) ═══════════════════════════════════

insert into users (id, name, phone, astrapay_balance) values
  ('11111111-1111-1111-1111-111111111111', 'Budi Santoso', '0812-3456-7890', 500000);

insert into motorcycles (id, user_id, plate, brand, model, year, odometer_km, avg_consumption_kml) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'D 4821 BJK', 'Honda', 'Vario 160', 2023, 24000, 45),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   'D 2871 KCE', 'Yamaha', 'NMAX 155', 2022, 18500, 40);

-- Vario: oil at exactly 80% used (2.400/3.000 km) — drives the demo notification.
-- All other components < 50% used.
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
  ('battery_swap', 'Ganti aki',     45, 50000);

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
  ('Filter oli',             'Astra Otoparts', 'filter',    18000,  10000, 'AHASS Bandung Timur', array['Vario 160','NMAX 155','PCX 160']),
  ('AHM Oil MPX-2 0.8L',     'Honda',          'oil',       58000,  10000, 'AHASS Kiaracondong',  array['Vario 160','BeAT','PCX 160']),
  ('Aki GTZ6V',              'GS Astra',       'battery',   235000, 25000, 'AHASS Bandung Timur', array['Vario 160','BeAT']),
  ('Aki GTZ7V',              'GS Astra',       'battery',   265000, 25000, 'AHASS Antapani',      array['NMAX 155','Aerox 155','PCX 160']),
  ('Kampas rem depan',       'Astra Otoparts', 'brake',     45000,  30000, 'Bengkel Jaya Motor',  array['Vario 160','NMAX 155']),
  ('Ban tubeless 100/80-14', 'FDR',            'tire',      210000, 35000, 'Bengkel Jaya Motor',  array['Vario 160','BeAT']),
  ('Ban tubeless 110/70-13', 'FDR',            'tire',      245000, 35000, 'Sumber Rejeki Motor', array['NMAX 155','Aerox 155']),
  ('Filter udara',           'Astra Otoparts', 'filter',    52000,  10000, 'AHASS Bandung Timur', array['Vario 160','NMAX 155']),
  ('Windshield sport',       'Generic',        'accessory', 150000, 20000, 'AHASS Antapani',      array['NMAX 155','Aerox 155','PCX 160'])
) as v(name, brand, category, price, install_fee, seller, models);

-- MotoScore: Budi at 720 with history
insert into motoscore (user_id, score) values
  ('11111111-1111-1111-1111-111111111111', 720);
insert into motoscore_history (user_id, delta, reason, created_at) values
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '80 days'),
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '50 days'),
  ('11111111-1111-1111-1111-111111111111', 10, 'Bayar STNK tepat waktu',       now() - interval '35 days'),
  ('11111111-1111-1111-1111-111111111111',  5, 'Servis sebelum 100% interval', now() - interval '20 days'),
  ('11111111-1111-1111-1111-111111111111', -5, 'Servis terlambat (oli 110%)',  now() - interval '8 days');

-- Points: Budi at 2.350
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
   'installment', 'Cicilan NMAX — FIFGROUP', 1150000, current_date + 12);

-- The unread maintenance notification matching the 80% oil state
insert into notifications (user_id, type, title, body) values
  ('11111111-1111-1111-1111-111111111111', 'maintenance',
   'Waktunya ganti oli',
   'Oli motor D 4821 BJK sudah 80% interval (2.400/3.000 km), masih 600 km lagi. Ganti sekarang atau tunggu?');

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

-- Payments backing the volume bookings (deposit for all non-cancelled, final for completed)
insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'deposit', deposit_amount, created_at
from bookings where status <> 'cancelled' and user_id <> '11111111-1111-1111-1111-111111111111';

insert into payments (user_id, booking_id, type, amount, created_at)
select user_id, id, 'final', greatest(0, coalesce(total_amount, 0) - deposit_amount),
       created_at + interval '3 hours'
from bookings where status = 'completed' and user_id <> '11111111-1111-1111-1111-111111111111';
