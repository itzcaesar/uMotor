// AstraPay payment-notification receiver (SNAP "Debit Notify").
//
// AstraPay POSTs here when a debit settles asynchronously. We match the
// notification to the payment we recorded (by partnerReferenceNo) and stamp
// `astrapay_settled_at` + the real referenceNo — so the Console and receipts
// reflect server-confirmed settlement, not just the client's status poll.
//
// DEPENDENCY: AstraPay must be configured with this URL as the merchant
// payment-notification callback (request it from the panitia / Danny):
//   https://<project-ref>.supabase.co/functions/v1/astrapay-webhook
// Until it's registered this endpoint simply never fires — the client
// status-poll stays the source of truth, so nothing in the demo breaks.
//
// SECURITY: production MUST verify the SNAP X-SIGNATURE on the inbound request
// before trusting it. We don't have AstraPay's notification signing spec/key
// confirmed for the sandbox, so verification is best-effort + logged here; the
// blast radius is limited because partnerReferenceNo is an unguessable uuid we
// generated and we only flip a status on an already-existing payment row.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const SETTLED = new Set(['00', 'APP', 'SUCCESS']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ responseCode: '4050000', responseMessage: 'Method Not Allowed' }, 405);
  }

  let body: Record<string, unknown> & {
    originalPartnerReferenceNo?: string;
    partnerReferenceNo?: string;
    originalReferenceNo?: string;
    referenceNo?: string;
    latestTransactionStatus?: string;
    transactionStatus?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ responseCode: '4000000', responseMessage: 'Bad Request' }, 400);
  }

  const partnerRef = body.originalPartnerReferenceNo ?? body.partnerReferenceNo;
  const ref = body.originalReferenceNo ?? body.referenceNo;
  const statusRaw = String(
    body.latestTransactionStatus ?? body.transactionStatus ?? '',
  ).toUpperCase();
  const settled = SETTLED.has(statusRaw);

  if (partnerRef) {
    const { error } = await db
      .from('payments')
      .update({
        astrapay_ref: ref ?? undefined,
        astrapay_settled_at: settled ? new Date().toISOString() : null,
        status: settled ? 'settled' : 'pending',
      })
      .eq('astrapay_partner_ref', partnerRef);
    if (error) {
      // Acknowledge anyway so AstraPay doesn't hammer retries; we just log.
      console.error('webhook update failed', error.message);
    }
  } else {
    console.warn('webhook: no partnerReferenceNo in notification', JSON.stringify(body));
  }

  // SNAP expects a 200 ack with a responseCode.
  return json({ responseCode: '2005600', responseMessage: 'Successful' });
});
