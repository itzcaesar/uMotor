// Live integration smoke test for the AstraPay SNAP Edge Function.
//
//   node scripts/astrapay-smoke.mjs
//
// Hits the deployed `astrapay` function against the real sandbox and asserts the
// core actions work — this exercises the full SNAP signing chain (RSA access
// token + HMAC transaction signature) end-to-end, which a unit test can't. Uses
// only the publishable anon key (client-safe). Override via env if needed.

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://shfzyxivmctpurwjjete.supabase.co';
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_7oH_AmFxpXQHXHV_-pyXpA_det78DmD';
const FN = `${URL}/functions/v1/astrapay`;
const USER = '11111111-1111-1111-1111-111111111111';
const AMOUNT = 1000;

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

async function call(body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

console.log(`AstraPay live smoke test → ${FN}\n`);

// 1. Account binding — proves the RSA access-token signing + binding endpoint.
console.log('[bind]');
const bind = await call({
  action: 'bind',
  finishBindingUrl: 'https://umotor.app/astrapay/bound',
  externalUid: USER,
  phoneNo: '085348861424',
});
check('responseCode 2000700', bind?.json?.responseCode === '2000700', bind?.json?.responseCode);
check('returns a redirectUrl', !!bind?.json?.redirectUrl);
check('returns an authCode', !!bind?.json?.additionalInfo?.authCode);

// 2. Debit — proves the HMAC transaction signature + Authorization-Customer path.
console.log('\n[pay]');
const pay = await call({ action: 'pay', amount: AMOUNT, description: 'smoke test', userId: USER });
check('responseCode 2005400', pay?.json?.responseCode === '2005400', pay?.json?.responseCode);
check('returns a webRedirectUrl', !!pay?.json?.webRedirectUrl);
check('returns a partnerReferenceNo', !!pay?.partnerReferenceNo);

// 3. Status — proves the status query signs + reaches AstraPay (the txn is
//    unsettled here, so a 404xx "not found" is a valid business response).
console.log('\n[status]');
const status = await call({
  action: 'status',
  originalPartnerReferenceNo: pay?.partnerReferenceNo,
  originalReferenceNo: pay?.json?.referenceNo,
  amount: AMOUNT,
});
check('status reachable (responseCode present)', !!status?.json?.responseCode, JSON.stringify(status?.json)?.slice(0, 140));

// 4. Link before authorize — must fail *gracefully* (structured error), not crash.
console.log('\n[link pre-auth — expect graceful error]');
const link = await call({
  action: 'link',
  userId: USER,
  authCode: bind?.json?.additionalInfo?.authCode,
  phoneNo: '085348861424',
});
check(
  'structured result (error or bound), no crash',
  link?.error !== undefined || link?.bound !== undefined,
  JSON.stringify(link)?.slice(0, 140),
);

// 5. Unknown action — must 400 with an error, not throw.
console.log('\n[guard — unknown action]');
const bad = await call({ action: 'definitely-not-a-real-action' });
check('rejects unknown action', !!bad?.error, JSON.stringify(bad)?.slice(0, 140));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
