-- uMotor prototype schema. Spec: docs/00-Architecture-Shared.md §4–§6.

-- ── Enums ────────────────────────────────────────────────────────────
create type component_type as enum ('oil','tire','battery','brake_pad','air_filter');
create type booking_status as enum ('pending','confirmed','checked_in','in_progress','completed','cancelled');
create type workshop_type  as enum ('ahass','independent');
create type workshop_tier  as enum ('basic','premium');
create type payment_type   as enum ('deposit','final','sparepart','bill');
create type bill_type      as enum ('stnk','fuel','installment');

-- ── Core ─────────────────────────────────────────────────────────────
create table users (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  avatar_url        text,
  astrapay_balance  integer not null default 500000,
  created_at        timestamptz not null default now()
);

create table motorcycles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  plate               text not null unique,
  brand               text not null,
  model               text not null,
  year                integer not null,
  odometer_km         integer not null default 0,
  avg_consumption_kml numeric not null default 45,
  photo_url           text,
  created_at          timestamptz not null default now()
);

create table components (
  id              uuid primary key default gen_random_uuid(),
  motorcycle_id   uuid not null references motorcycles(id) on delete cascade,
  type            component_type not null,
  interval_km     integer not null,
  last_service_km integer not null default 0,
  unique (motorcycle_id, type)
); 

-- ── Workshops & booking ──────────────────────────────────────────────
create table workshops (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  type                   workshop_type not null,
  tier                   workshop_tier not null default 'basic',
  rating                 numeric not null default 4.5,
  address                text,
  lat                    numeric,
  lng                    numeric,
  distance_km            numeric,
  price_estimate_min     integer,
  price_estimate_max     integer,
  home_service           boolean not null default false,
  home_service_radius_km integer,
  home_service_fee       integer,
  photo_url              text,
  created_at             timestamptz not null default now()
);

create table services (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name         text not null,
  duration_min integer not null,
  base_price   integer not null
);

create table slots (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references workshops(id) on delete cascade,
  slot_at      timestamptz not null,
  capacity     integer not null default 1,
  booked_count integer not null default 0,
  unique (workshop_id, slot_at)
);

create table bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id),
  motorcycle_id   uuid not null references motorcycles(id),
  workshop_id     uuid not null references workshops(id),
  slot_id         uuid references slots(id),
  service_id      uuid not null references services(id),
  status          booking_status not null default 'pending',
  is_home_service boolean not null default false,
  home_address    text,
  home_lat        numeric,
  home_lng        numeric,
  deposit_amount  integer not null default 25000,
  total_amount    integer,
  qr_token        text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index bookings_workshop_idx on bookings (workshop_id, created_at desc);
create index bookings_user_idx on bookings (user_id, created_at desc);

-- ── Marketplace ──────────────────────────────────────────────────────
create table spareparts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  brand             text,
  category          text not null,
  price             integer not null,
  install_fee       integer not null default 0,   -- fee if "Pasang di bengkel"; configurable via Workshop app
  workshop_id       uuid references workshops(id), -- seller workshop
  image_url         text,
  compatible_models text[] not null default '{}'
);

create table booking_parts (
  booking_id   uuid not null references bookings(id) on delete cascade,
  sparepart_id uuid not null references spareparts(id),
  qty          integer not null default 1,
  unit_price   integer not null,
  primary key (booking_id, sparepart_id)
);

-- ── Score, points, money, misc ───────────────────────────────────────
create table motoscore (
  user_id    uuid primary key references users(id) on delete cascade,
  score      integer not null default 600 check (score between 300 and 850),
  updated_at timestamptz not null default now()
);

create table motoscore_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table points (
  user_id uuid primary key references users(id) on delete cascade,
  balance integer not null default 0
);

create table points_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

create table payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  booking_id uuid references bookings(id),
  type       payment_type not null,
  amount     integer not null,
  status     text not null default 'success',
  created_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table bills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  motorcycle_id uuid references motorcycles(id),
  type          bill_type not null,
  name          text not null,
  amount        integer not null,
  due_date      date not null,
  paid          boolean not null default false
);

-- ── Views ────────────────────────────────────────────────────────────
create view component_health as
select
  c.id, c.motorcycle_id, c.type, c.interval_km, c.last_service_km,
  m.odometer_km,
  (m.odometer_km - c.last_service_km)                            as used_km,
  least(100, round((m.odometer_km - c.last_service_km)::numeric
        / c.interval_km * 100))                                  as pct_used,
  greatest(0, 100 - round((m.odometer_km - c.last_service_km)::numeric
        / c.interval_km * 100))                                  as health_pct
from components c
join motorcycles m on m.id = c.motorcycle_id;

create view v_kpi_overview as
select
  (select count(*) from users)                                          as active_users,
  (select count(*) from bookings where created_at::date = current_date) as bookings_today,
  (select coalesce(sum(amount),0) from payments)                        as gmv,
  (select count(*) from workshops)                                      as partner_workshops;

create view v_motoscore_distribution as
select width_bucket(score, 300, 851, 11) as bucket,
       min(score) as bucket_min, count(*) as n
from motoscore group by 1 order by 1;

create view v_revenue_breakdown as
select type, sum(amount) as total from payments group by type;

create view v_bookings_recent as
select b.id, b.created_at, b.status, b.total_amount,
       u.name as customer, m.plate, w.name as workshop, s.name as service
from bookings b
join users u on u.id = b.user_id
join motorcycles m on m.id = b.motorcycle_id
join workshops w on w.id = b.workshop_id
join services s on s.id = b.service_id
order by b.created_at desc;

-- ── RPCs ─────────────────────────────────────────────────────────────

-- 6.1 book_slot: atomic slot lock + booking + deposit. "Zero double booking".
create or replace function book_slot(
  p_user_id       uuid,
  p_motorcycle_id uuid,
  p_workshop_id   uuid,
  p_slot_id       uuid,
  p_service_id    uuid,
  p_part_ids      uuid[] default '{}'
) returns bookings
language plpgsql
as $$
declare
  v_slot        slots%rowtype;
  v_booking     bookings%rowtype;
  v_service     services%rowtype;
  v_parts_total integer := 0;
  v_home_fee    integer := 0;
  v_part        record;
begin
  select * into v_service from services where id = p_service_id;
  if not found then raise exception 'service_not_found'; end if;

  if p_slot_id is not null then
    select * into v_slot from slots where id = p_slot_id for update;
    if not found then raise exception 'slot_not_found'; end if;
    if v_slot.booked_count >= v_slot.capacity then
      raise exception 'slot_full';
    end if;
    update slots set booked_count = booked_count + 1 where id = p_slot_id;
  else
    select coalesce(home_service_fee, 0) into v_home_fee
    from workshops where id = p_workshop_id;
  end if;

  insert into bookings (user_id, motorcycle_id, workshop_id, slot_id, service_id,
                        is_home_service, deposit_amount)
  values (p_user_id, p_motorcycle_id, p_workshop_id, p_slot_id, p_service_id,
          p_slot_id is null, 25000)
  returning * into v_booking;

  for v_part in
    select s.id, s.price from spareparts s where s.id = any(p_part_ids)
  loop
    insert into booking_parts (booking_id, sparepart_id, qty, unit_price)
    values (v_booking.id, v_part.id, 1, v_part.price);
    v_parts_total := v_parts_total + v_part.price;
  end loop;

  update bookings
  set total_amount = v_service.base_price + v_parts_total + v_home_fee
  where id = v_booking.id
  returning * into v_booking;

  insert into payments (user_id, booking_id, type, amount)
  values (p_user_id, v_booking.id, 'deposit', v_booking.deposit_amount);

  update users set astrapay_balance = astrapay_balance - v_booking.deposit_amount
  where id = p_user_id;

  return v_booking;
end;
$$;

-- 6.2 update_booking_status: validates transition against the state machine.
create or replace function update_booking_status(
  p_booking_id uuid,
  p_status     booking_status
) returns bookings
language plpgsql
as $$
declare
  v_booking bookings%rowtype;
  v_legal   boolean;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;

  v_legal := case
    when v_booking.status = 'pending'     and p_status in ('confirmed','cancelled')   then true
    when v_booking.status = 'confirmed'   and p_status in ('checked_in','cancelled')  then true
    when v_booking.status = 'checked_in'  and p_status = 'in_progress'                then true
    else false
  end;
  if not v_legal then
    raise exception 'illegal_transition: % -> %', v_booking.status, p_status;
  end if;

  if p_status = 'cancelled' then
    if v_booking.slot_id is not null then
      update slots set booked_count = greatest(0, booked_count - 1)
      where id = v_booking.slot_id;
    end if;
    -- refund deposit to wallet
    update users set astrapay_balance = astrapay_balance + v_booking.deposit_amount
    where id = v_booking.user_id;
  end if;

  update bookings set status = p_status, updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- 6.3 complete_booking: the finale with all side effects.
create or replace function complete_booking(p_booking_id uuid) returns bookings
language plpgsql
as $$
declare
  v_booking   bookings%rowtype;
  v_final     integer;
  v_odo       integer;
  v_svc_code  text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if v_booking.status not in ('checked_in','in_progress') then
    raise exception 'illegal_transition: % -> completed', v_booking.status;
  end if;

  update bookings set status = 'completed', updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  -- final payment = total - deposit (demo: 83.000 - 25.000 = 58.000)
  v_final := greatest(0, coalesce(v_booking.total_amount, 0) - v_booking.deposit_amount);
  insert into payments (user_id, booking_id, type, amount)
  values (v_booking.user_id, p_booking_id, 'final', v_final);
  update users set astrapay_balance = astrapay_balance - v_final
  where id = v_booking.user_id;

  -- MotoScore +5
  insert into motoscore (user_id, score) values (v_booking.user_id, 605)
  on conflict (user_id)
  do update set score = least(850, motoscore.score + 5), updated_at = now();
  insert into motoscore_history (user_id, delta, reason)
  values (v_booking.user_id, 5, 'Servis sebelum 100% interval');

  -- +500 MotoPoints
  insert into points (user_id, balance) values (v_booking.user_id, 500)
  on conflict (user_id) do update set balance = points.balance + 500;
  insert into points_history (user_id, delta, reason)
  values (v_booking.user_id, 500, 'Servis selesai');

  -- reset serviced components
  select odometer_km into v_odo from motorcycles where id = v_booking.motorcycle_id;
  select code into v_svc_code from services where id = v_booking.service_id;
  if v_svc_code = 'tune_up' then
    update components set last_service_km = v_odo
    where motorcycle_id = v_booking.motorcycle_id;
  elsif v_svc_code = 'battery_swap' then
    update components set last_service_km = v_odo
    where motorcycle_id = v_booking.motorcycle_id and type = 'battery';
  else
    update components set last_service_km = v_odo
    where motorcycle_id = v_booking.motorcycle_id and type = 'oil';
  end if;

  insert into notifications (user_id, type, title, body)
  values (v_booking.user_id, 'score', 'Servis selesai',
          'MotoScore +5, +500 MotoPoints. Terima kasih sudah servis tepat waktu!');

  return v_booking;
end;
$$;

-- 6.4 advance_odometer: demo control; fires 80/95/100% notifications on crossing.
create or replace function advance_odometer(
  p_motorcycle_id uuid,
  p_km            integer
) returns void
language plpgsql
as $$
declare
  v_bike      motorcycles%rowtype;
  v_comp      record;
  v_old_pct   numeric;
  v_new_pct   numeric;
  v_threshold integer;
  v_remaining integer;
begin
  select * into v_bike from motorcycles where id = p_motorcycle_id for update;
  if not found then raise exception 'motorcycle_not_found'; end if;

  update motorcycles set odometer_km = odometer_km + p_km
  where id = p_motorcycle_id;

  for v_comp in
    select * from components where motorcycle_id = p_motorcycle_id
  loop
    v_old_pct := (v_bike.odometer_km - v_comp.last_service_km)::numeric / v_comp.interval_km * 100;
    v_new_pct := (v_bike.odometer_km + p_km - v_comp.last_service_km)::numeric / v_comp.interval_km * 100;
    foreach v_threshold in array array[80, 95, 100]
    loop
      if v_old_pct < v_threshold and v_new_pct >= v_threshold then
        v_remaining := greatest(0, v_comp.interval_km - (v_bike.odometer_km + p_km - v_comp.last_service_km));
        insert into notifications (user_id, type, title, body)
        values (
          v_bike.user_id, 'maintenance',
          format('Komponen %s sudah %s%% interval', v_comp.type, v_threshold),
          format('Motor %s: %s sudah %s%% interval, masih %s km lagi. Ganti sekarang atau tunggu?',
                 v_bike.plate, v_comp.type, v_threshold, v_remaining)
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- ── RLS: enabled, permissive for anon (prototype only — no real auth) ─
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy anon_all on %I for all using (true) with check (true)', t);
  end loop;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table bookings, motoscore, points, slots, notifications;
