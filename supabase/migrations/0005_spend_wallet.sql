-- Atomic wallet spend.
--
-- Before this, the consumer checkout flows (cart, BBM top-up, Finance bill)
-- moved money from the client in several separate round-trips: a `payments`
-- insert, a read-modify-write of `users.astrapay_balance`, and (for bills) a
-- `bills` update. That was non-atomic — a mid-sequence failure could record a
-- payment without decrementing the balance (or mark a bill paid with no
-- payment row), and two concurrent spends could lose an update. It also
-- bypassed the repo rule "never mutate tables directly from the client — call
-- an RPC" (book_slot/complete_booking already move money server-side).
--
-- `spend_wallet` collapses the whole DB side into ONE transaction: insert the
-- payment, clamp-decrement the wallet, and optionally mark a bill paid — all or
-- nothing. Call it AFTER a successful AstraPay debit, passing the real refs so
-- the payment row carries them for Console reconciliation.

create or replace function spend_wallet(
  p_user_id              uuid,
  p_type                 payment_type,
  p_amount               integer,
  p_astrapay_ref         text default null,
  p_astrapay_partner_ref text default null,
  p_booking_id           uuid default null,
  p_bill_id              uuid default null
) returns payments
language plpgsql
as $$
declare
  v_payment payments%rowtype;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be a non-negative integer (Rupiah)';
  end if;

  insert into payments (user_id, booking_id, type, amount,
                        astrapay_ref, astrapay_partner_ref)
  values (p_user_id, p_booking_id, p_type, p_amount,
          p_astrapay_ref, p_astrapay_partner_ref)
  returning * into v_payment;

  -- Clamp at 0 so a drained demo wallet never shows a negative balance.
  update users
  set astrapay_balance = greatest(0, astrapay_balance - p_amount)
  where id = p_user_id;

  if p_bill_id is not null then
    update bills set paid = true where id = p_bill_id;
  end if;

  return v_payment;
end;
$$;
