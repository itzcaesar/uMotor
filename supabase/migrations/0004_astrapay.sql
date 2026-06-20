-- AstraPay live (SNAP Payment Channel) — persistence the integration needs.
--
-- The payment *flow* (debit + status poll) is fully server-signed in the
-- `astrapay` Edge Function; this migration adds the columns that flow writes to:
--
--   1. Reconciliation refs — store AstraPay's referenceNo + our partnerReferenceNo
--      on every payment and on a booking's deposit, so receipts and the Console
--      show the real AstraPay transaction id (matches the merchant statement).
--   2. Account binding — persist the customer's bound wallet token so debits can
--      reuse it and skip the push-payment re-login. The token is short-lived and
--      scoped to debits on our merchant; it lives on the users row only because
--      this is a fake-auth sandbox demo (permissive RLS by design — see CLAUDE.md).
--   3. Async settlement — `astrapay_settled_at` is stamped by the
--      `astrapay-webhook` function when AstraPay POSTs a payment notification.
--
-- All columns are additive + nullable, so this is a non-destructive `db push`
-- that leaves the seeded demo numbers untouched.

alter table payments
  add column if not exists astrapay_ref         text,        -- AstraPay referenceNo (e.g. INV/PAC/ONP/...)
  add column if not exists astrapay_partner_ref text,        -- our partnerReferenceNo (uuid we generate)
  add column if not exists astrapay_settled_at  timestamptz; -- set by the payment-notification webhook

alter table bookings
  add column if not exists astrapay_ref text;                -- deposit payment referenceNo (shown on the receipt)

alter table users
  add column if not exists astrapay_phone            text,
  add column if not exists astrapay_customer_token   text,        -- B2B2C wallet token from binding (sandbox only)
  add column if not exists astrapay_token_expires_at timestamptz, -- token validity; debits fall back to push-payment once expired
  add column if not exists astrapay_bound_at         timestamptz; -- when the wallet was linked (drives the profile UI)
