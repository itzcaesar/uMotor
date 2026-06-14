-- Ride tracking (PRD 01 — core feature). Real foreground GPS + sensor-classified
-- rides on the consumer app, plus a deterministic "simulated" source for stage
-- demos. Distance is NEVER trusted from the client: finish_ride recomputes it
-- server-side from the stored points (haversine), gates teleports/low-accuracy
-- segments, rejects mock-location tracks, and only then awards rewards and
-- advances the odometer. Real rides thus replace the fuel-estimate odometer hack.

-- ── Tables ───────────────────────────────────────────────────────────
create table rides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  motorcycle_id uuid not null references motorcycles(id) on delete cascade,
  source        text not null default 'gps'    check (source in ('gps','simulated')),
  status        text not null default 'active'  check (status in ('active','completed','discarded')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  distance_m    integer not null default 0,   -- server-validated, not client-claimed
  duration_s    integer not null default 0,
  avg_kmh       numeric not null default 0,
  max_kmh       numeric not null default 0,
  eco_score     integer,                      -- 0–100, from harsh-event density
  harsh_events  integer not null default 0,
  flagged       boolean not null default false,
  flag_reason   text,
  created_at    timestamptz not null default now()
);
create index rides_user_started_idx on rides (user_id, started_at desc);

-- High-volume; intentionally NOT published on Realtime (rides status is enough).
create table ride_points (
  id         bigserial primary key,
  ride_id    uuid not null references rides(id) on delete cascade,
  ts         timestamptz not null,
  lat        double precision not null,
  lng        double precision not null,
  accuracy_m real,
  speed_mps  real,
  altitude_m real,
  mocked     boolean not null default false,   -- Android Location.mocked → anti-cheat
  activity   text                              -- classifier: motorcycle|walking|running|vehicle|unknown
);
create index ride_points_ride_ts_idx on ride_points (ride_id, ts);

create table ride_events (
  id      uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  ts      timestamptz not null,
  type    text not null,   -- harsh_brake|harsh_accel|sharp_lean|overspeed|idle
  value   numeric,
  lat     double precision,
  lng     double precision
);
create index ride_events_ride_idx on ride_events (ride_id);

-- ── finish_ride: the trust boundary ─────────────────────────────────
-- Recomputes distance from points, drops bad segments, validates the ride,
-- then (only if clean) advances the odometer and awards MotoPoints. MotoScore
-- is deliberately left to service punctuality so the demo-exact 720 is stable.
create or replace function finish_ride(p_ride_id uuid) returns rides
language plpgsql
as $$
declare
  v_ride      rides%rowtype;
  v_pt        record;
  v_prev_lat  double precision;
  v_prev_lng  double precision;
  v_prev_ts   timestamptz;
  v_prev_acc  double precision;
  v_seg       double precision;
  v_dt        double precision;
  v_spd       double precision;          -- m/s
  v_dist      double precision := 0;
  v_max_spd   double precision := 0;
  v_sum_spd   double precision := 0;
  v_n_spd     integer := 0;
  v_mocked    boolean := false;
  v_dur       integer;
  v_km        integer;
  v_pts       integer;
  v_harsh     integer;
  c_acc_gate  constant double precision := 50;     -- drop fixes worse than 50 m
  c_max_mps   constant double precision := 33.3;   -- ~120 km/h: above = teleport
  c_min_dist  constant integer := 300;             -- min real ride
  c_min_dur   constant integer := 60;
begin
  select * into v_ride from rides where id = p_ride_id for update;
  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status <> 'active' then
    raise exception 'illegal_transition: ride already %', v_ride.status;
  end if;

  if v_ride.ended_at is null then
    update rides set ended_at = now() where id = p_ride_id returning * into v_ride;
  end if;
  v_dur := greatest(0, extract(epoch from (v_ride.ended_at - v_ride.started_at))::integer);

  -- Walk points in time order; sum only physically-plausible, accurate segments.
  for v_pt in
    select * from ride_points where ride_id = p_ride_id order by ts
  loop
    if v_pt.mocked then v_mocked := true; end if;
    if v_prev_ts is not null then
      v_dt := extract(epoch from (v_pt.ts - v_prev_ts));
      if v_dt > 0
         and coalesce(v_pt.accuracy_m, 0)  <= c_acc_gate
         and coalesce(v_prev_acc, 0)       <= c_acc_gate then
        v_seg := 2 * 6371000 * asin(least(1, sqrt(
          power(sin(radians(v_pt.lat - v_prev_lat) / 2), 2)
          + cos(radians(v_prev_lat)) * cos(radians(v_pt.lat))
            * power(sin(radians(v_pt.lng - v_prev_lng) / 2), 2)
        )));
        v_spd := v_seg / v_dt;
        if v_spd <= c_max_mps then               -- skip teleport segments
          v_dist    := v_dist + v_seg;
          v_sum_spd := v_sum_spd + v_spd;
          v_n_spd   := v_n_spd + 1;
          if v_spd > v_max_spd then v_max_spd := v_spd; end if;
        end if;
      end if;
    end if;
    v_prev_lat := v_pt.lat; v_prev_lng := v_pt.lng;
    v_prev_ts  := v_pt.ts;  v_prev_acc := v_pt.accuracy_m;
  end loop;

  select count(*) into v_harsh from ride_events
  where ride_id = p_ride_id
    and type in ('harsh_brake','harsh_accel','sharp_lean','overspeed');

  -- Too short / too brief → keep the record, no rewards.
  if v_dist < c_min_dist or v_dur < c_min_dur then
    update rides set
      status      = 'discarded',
      distance_m  = round(v_dist)::integer,
      duration_s  = v_dur,
      flagged     = v_mocked,
      flag_reason = case when v_mocked then 'mock_location' else 'too_short' end
    where id = p_ride_id returning * into v_ride;
    return v_ride;
  end if;

  -- Mock-location on a "real" GPS ride → record but withhold all rewards.
  if v_mocked and v_ride.source = 'gps' then
    update rides set
      status       = 'completed',
      flagged      = true,
      flag_reason  = 'mock_location',
      distance_m   = round(v_dist)::integer,
      duration_s   = v_dur,
      avg_kmh      = case when v_n_spd > 0 then round((v_sum_spd / v_n_spd * 3.6)::numeric, 1) else 0 end,
      max_kmh      = round((v_max_spd * 3.6)::numeric, 1),
      harsh_events = v_harsh,
      eco_score    = greatest(0, 100 - least(100, v_harsh * 8))
    where id = p_ride_id returning * into v_ride;
    return v_ride;
  end if;

  -- Clean ride.
  update rides set
    status       = 'completed',
    distance_m   = round(v_dist)::integer,
    duration_s   = v_dur,
    avg_kmh      = case when v_n_spd > 0 then round((v_sum_spd / v_n_spd * 3.6)::numeric, 1) else 0 end,
    max_kmh      = round((v_max_spd * 3.6)::numeric, 1),
    harsh_events = v_harsh,
    eco_score    = greatest(0, 100 - least(100, v_harsh * 8))
  where id = p_ride_id returning * into v_ride;

  -- Real rides drive the odometer (and its 80/95/100% maintenance notifications).
  v_km := round(v_dist / 1000.0)::integer;
  if v_km > 0 then
    perform advance_odometer(v_ride.motorcycle_id, v_km);
  end if;

  -- MotoPoints by distance (10 / km).
  v_pts := v_km * 10;
  if v_pts > 0 then
    insert into points (user_id, balance) values (v_ride.user_id, v_pts)
    on conflict (user_id) do update set balance = points.balance + v_pts;
    insert into points_history (user_id, delta, reason)
    values (v_ride.user_id, v_pts, format('Ride %s km', v_km));
  end if;

  insert into notifications (user_id, type, title, body)
  values (
    v_ride.user_id, 'ride',
    format('Ride selesai — %s km', v_km),
    format('Jarak %s km, skor eco %s. +%s MotoPoin. Odometer & jadwal servis ikut terupdate.',
           v_km, v_ride.eco_score, v_pts)
  );

  return v_ride;
end;
$$;

-- ── RLS (new tables; 0001's loop already ran) ───────────────────────
alter table rides       enable row level security;
alter table ride_points enable row level security;
alter table ride_events enable row level security;
create policy anon_all on rides       for all using (true) with check (true);
create policy anon_all on ride_points for all using (true) with check (true);
create policy anon_all on ride_events for all using (true) with check (true);

-- ── Realtime ─────────────────────────────────────────────────────────
alter publication supabase_realtime add table rides;
