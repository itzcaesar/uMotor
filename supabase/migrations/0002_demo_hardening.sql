-- Demo-day hardening. The mock AstraPay never fails, so repeated rehearsals can
-- drain the seeded wallet; clamp balance updates at 0 so the UI never shows a
-- negative balance mid-pitch. Function bodies otherwise identical to 0001.

-- book_slot: deposit deduction clamped at 0.
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

  update users
  set astrapay_balance = greatest(0, astrapay_balance - v_booking.deposit_amount)
  where id = p_user_id;

  return v_booking;
end;
$$;

-- complete_booking: final-payment deduction clamped at 0.
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
  update users
  set astrapay_balance = greatest(0, astrapay_balance - v_final)
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
