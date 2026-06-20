// AstraPay SNAP (BI v1.0) Payment Channel — server-side integration.
//
// Why an Edge Function: SNAP signing needs the Client Secret and the RSA
// private key, which MUST NOT ship to the client (they bypass merchant
// security). All signing + AstraPay calls happen here; the apps only ever
// invoke this function with the publishable anon key.
//
// Flow (Saldo AstraPay is the only active sandbox channel):
//   1. account binding  -> user links their AstraPay wallet (webview, OTP 111111 + PIN)
//   2. debit payment    -> charge the linked wallet (webview PIN confirm)
//   3. payment status   -> poll until SUCCESS / FAILED
//
// Signing (per https://www.astrapay.com/docs/api/#snap-keamanan):
//   - Access token (B2B): SHA256withRSA over `${clientId}|${timestamp}`, base64.
//   - Transactional:      HMAC-SHA512 over
//       `${method}:${relativePath}:${accessToken}:${sha256HexLower(minifiedBody)}:${timestamp}`
//     keyed with the Client Secret, base64.
//
// Secrets (set with `supabase secrets set` — see functions/astrapay/.env.example):
//   ASTRAPAY_BASE_URL, ASTRAPAY_CLIENT_ID, ASTRAPAY_CLIENT_SECRET,
//   ASTRAPAY_MERCHANT_ID, ASTRAPAY_PRIVATE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

// AstraPay splits endpoints across two service bases:
//   - snap-service:     access token, account binding/unbinding
//   - merchant-service: debit payment, debit status/refund
const BASE_URL = (Deno.env.get('ASTRAPAY_BASE_URL') ??
  'https://sandbox.astrapay.com/snap-service/snap/v1.0').replace(/\/+$/, '');
const MERCHANT_BASE_URL = (
  Deno.env.get('ASTRAPAY_MERCHANT_BASE_URL') ??
  BASE_URL.replace('snap-service', 'merchant-service')
).replace(/\/+$/, '');
// Customer Top Up (SNAP Transfer Kredit) — merchant disburses into a wallet.
// Used to fund a sandbox test account (no dashboard exists). Not a demo path.
const DISBURSE_BASE_URL = (
  Deno.env.get('ASTRAPAY_DISBURSE_BASE_URL') ??
  BASE_URL.replace('snap-service', 'disbursement-service')
).replace(/\/+$/, '');
const CLIENT_ID = Deno.env.get('ASTRAPAY_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('ASTRAPAY_CLIENT_SECRET') ?? '';
const MERCHANT_ID = Deno.env.get('ASTRAPAY_MERCHANT_ID') ?? '';
const PRIVATE_KEY_PEM = Deno.env.get('ASTRAPAY_PRIVATE_KEY') ?? '';

// Service-role client for account binding: stores/loads the customer's bound
// wallet token on the users row. SUPABASE_URL + SERVICE_ROLE_KEY are injected
// into deployed Edge Functions automatically; `db` is null if they're absent
// (e.g. local without env), in which case binding is a no-op and pay falls back
// to push-payment.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// SNAP service/channel codes per endpoint (from the Payment Channel docs).
// CHANNEL-ID is the fixed per-service identifier from the docs (validated on the
// merchant-service endpoints). serviceCode must match the transaction being
// queried: debit payment-host-to-host = 54.
const CHANNEL = {
  binding: '01207',
  unbinding: '01709',
  payment: '00854', // Direct Debit Payment
  paymentStatus: '00155', // Direct Debit Payment Status
  topupInquiry: '01437', // Account Inquiry - Customer Top Up
  topup: '01538', // Customer Top Up
} as const;
const SERVICE_CODE = { payment: '54' } as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// crypto helpers (Web Crypto — available in the Deno edge runtime)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

function b64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '') // env-file stores newlines as the literal two chars \n
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

let privateKeyPromise: Promise<CryptoKey> | null = null;
function getPrivateKey(): Promise<CryptoKey> {
  if (!privateKeyPromise) {
    privateKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      pemToDer(PRIVATE_KEY_PEM),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return privateKeyPromise;
}

async function signAsymmetric(stringToSign: string): Promise<string> {
  const key = await getPrivateKey();
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(stringToSign),
  );
  return b64(sig);
}

async function signSymmetric(stringToSign: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(CLIENT_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(stringToSign));
  return b64(sig);
}

async function sha256HexLower(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// SNAP timestamp: ISO 8601 with the merchant's WIB (+07:00) offset.
function snapTimestamp(): string {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return wib.toISOString().replace(/\.\d{3}Z$/, '+07:00');
}

// X-EXTERNAL-ID: unique numeric string (<=36 chars), unique per day per partner.
function externalId(): string {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, '0');
  return (ts + rand).slice(0, 36);
}

// ---------------------------------------------------------------------------
// AstraPay calls
// ---------------------------------------------------------------------------

// B2B access token, cached until ~30s before expiry.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const timestamp = snapTimestamp();
  const signature = await signAsymmetric(`${CLIENT_ID}|${timestamp}`);
  const url = `${BASE_URL}/access-token/b2b`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-CLIENT-KEY': CLIENT_ID,
      'X-SIGNATURE': signature,
    },
    body: JSON.stringify({ grantType: 'client_credentials' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.accessToken) {
    throw new Error(
      `access-token failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  const ttlSec = Number(json.expiresIn ?? 900);
  tokenCache = {
    token: json.accessToken,
    expiresAt: Date.now() + (ttlSec - 30) * 1000,
  };
  return json.accessToken;
}

// B2B2C customer token — exchanges the binding authCode for the wallet access
// token that authorises debits (sent as `Authorization-Customer`). Asymmetric
// signature, same as the B2B token. The authCode is single-use, so we exchange
// it once at bind time and persist the resulting token (see actionLink).
async function exchangeCustomerToken(
  authCode: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const timestamp = snapTimestamp();
  const signature = await signAsymmetric(`${CLIENT_ID}|${timestamp}`);
  const res = await fetch(`${BASE_URL}/access-token/b2b2c`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-CLIENT-KEY': CLIENT_ID,
      'X-SIGNATURE': signature,
    },
    body: JSON.stringify({ grantType: 'AUTHORIZATION_CODE', authCode }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.accessToken) {
    throw new Error(`b2b2c token failed: ${res.status} ${JSON.stringify(json)}`);
  }
  const ttlSec = Number(json.expiresIn ?? 0) || 900; // SNAP customer tokens ~15min
  return {
    accessToken: json.accessToken,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
}

// Load a user's stored (non-expired) bound wallet token, if any.
async function loadCustomerToken(userId: string): Promise<string | undefined> {
  if (!db) return undefined;
  try {
    const { data } = await db
      .from('users')
      .select('astrapay_customer_token, astrapay_token_expires_at')
      .eq('id', userId)
      .single();
    const row = data as
      | { astrapay_customer_token?: string; astrapay_token_expires_at?: string }
      | null;
    if (
      row?.astrapay_customer_token &&
      row.astrapay_token_expires_at &&
      new Date(row.astrapay_token_expires_at).getTime() > Date.now()
    ) {
      return row.astrapay_customer_token;
    }
  } catch (_) {
    // fall through to push-payment
  }
  return undefined;
}

interface TxnOptions {
  path: string; // relative to the chosen base, e.g. "/debit/payment-host-to-host"
  channelId: string;
  body: Record<string, unknown>;
  deviceId?: string;
  base?: string; // defaults to the snap-service base
  customerToken?: string; // wallet token for debit calls (Authorization-Customer)
}

async function callTransactional(
  { path, channelId, body, deviceId, base, customerToken }: TxnOptions,
) {
  const token = await getAccessToken();
  const timestamp = snapTimestamp();
  const url = `${base ?? BASE_URL}${path}`;
  const relativePath = new URL(url).pathname;
  const minified = JSON.stringify(body);
  const bodyHash = await sha256HexLower(minified);
  const stringToSign = `POST:${relativePath}:${token}:${bodyHash}:${timestamp}`;
  const signature = await signSymmetric(stringToSign);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
    'X-PARTNER-ID': CLIENT_ID,
    'X-EXTERNAL-ID': externalId(),
    'X-DEVICE-ID': deviceId ?? 'umotor-app',
    'CHANNEL-ID': channelId,
  };
  if (customerToken) headers['Authorization-Customer'] = `Bearer ${customerToken}`;

  const res = await fetch(url, { method: 'POST', headers, body: minified });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

// SNAP money: string value with 2 decimals.
function snapAmount(rupiah: number) {
  return { value: Math.round(rupiah).toFixed(2), currency: 'IDR' };
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

interface BindPayload {
  phoneNo?: string;
  finishBindingUrl: string;
  externalUid: string;
  name?: string;
  email?: string;
  deviceId?: string;
}

async function actionBind(p: BindPayload) {
  return callTransactional({
    path: '/registration-account-binding',
    channelId: CHANNEL.binding,
    deviceId: p.deviceId,
    body: {
      merchantId: MERCHANT_ID,
      phoneNo: p.phoneNo,
      additionalInfo: {
        finishBindingUrl: p.finishBindingUrl,
        externalUid: p.externalUid,
        name: p.name,
        email: p.email,
      },
    },
  });
}

interface PayPayload {
  amount: number;
  description?: string;
  partnerReferenceNo?: string;
  authCode?: string; // from account binding — exchanged here for a wallet token
  customerToken?: string; // pre-exchanged wallet token (skips authCode exchange)
  userId?: string; // if bound, reuse the stored wallet token (skips re-login)
  deviceId?: string;
}

async function actionPay(p: PayPayload) {
  const partnerReferenceNo = p.partnerReferenceNo ?? crypto.randomUUID();
  let customerToken = p.customerToken;
  if (!customerToken && p.authCode) {
    customerToken = (await exchangeCustomerToken(p.authCode)).accessToken;
  }
  // Bound wallet: reuse the persisted token so the debit can settle without a
  // push-payment re-login. Absent/expired → customerToken stays undefined and
  // the debit returns a webRedirectUrl (the proven push-payment path).
  if (!customerToken && p.userId) {
    customerToken = await loadCustomerToken(p.userId);
  }

  const result = await callTransactional({
    path: '/debit/payment-host-to-host',
    base: MERCHANT_BASE_URL,
    channelId: CHANNEL.payment,
    deviceId: p.deviceId,
    customerToken,
    body: {
      partnerReferenceNo,
      merchantId: MERCHANT_ID,
      amount: snapAmount(p.amount),
      // additionalInfo.description is mandatory for debit payment-host-to-host.
      additionalInfo: { description: p.description || 'Pembayaran uMotor' },
    },
  });
  return { ...result, partnerReferenceNo };
}

interface StatusPayload {
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  amount?: number; // mandatory for debit/status
}

async function actionStatus(p: StatusPayload) {
  return callTransactional({
    path: '/debit/status',
    base: MERCHANT_BASE_URL,
    channelId: CHANNEL.paymentStatus,
    body: {
      originalPartnerReferenceNo: p.originalPartnerReferenceNo,
      originalReferenceNo: p.originalReferenceNo ?? '',
      serviceCode: SERVICE_CODE.payment,
      amount: snapAmount(p.amount ?? 0),
    },
  });
}

interface TopupPayload {
  customerNumber: string; // customer phone, must be registered
  amount: number; // integer Rupiah (min 10000)
  notes?: string;
}

// Fund a sandbox wallet: account-inquiry → topup (reuses inquiry's
// partnerReferenceNo + feeAmount). Disbursement debits the merchant balance.
async function actionTopup(p: TopupPayload) {
  const partnerReferenceNo = crypto.randomUUID();
  const transactionDate = snapTimestamp();
  const amount = snapAmount(p.amount);
  const channelCode = { channelCode: 'APBANK' };

  const inquiry = await callTransactional({
    path: '/emoney/account-inquiry',
    base: DISBURSE_BASE_URL,
    channelId: CHANNEL.topupInquiry,
    body: { partnerReferenceNo, customerNumber: p.customerNumber, amount, transactionDate, additionalInfo: channelCode },
  });
  if (!inquiry.json.responseCode?.startsWith('200')) {
    return { step: 'inquiry', ...inquiry };
  }

  const topup = await callTransactional({
    path: '/emoney/topup',
    base: DISBURSE_BASE_URL,
    channelId: CHANNEL.topup,
    body: {
      partnerReferenceNo,
      customerNumber: p.customerNumber,
      customerName: inquiry.json.customerName ?? 'AstraPay Customer',
      amount,
      feeAmount: inquiry.json.feeAmount ?? { value: '0.00', currency: 'IDR' },
      transactionDate,
      notes: p.notes ?? 'Top up uMotor sandbox',
      additionalInfo: channelCode,
    },
  });
  return { step: 'topup', partnerReferenceNo, inquiry: inquiry.json, ...topup };
}

interface UnbindPayload {
  authCode?: string;
  accessToken?: string;
  deviceId?: string;
}

async function actionUnbind(p: UnbindPayload) {
  return callTransactional({
    path: '/registration-account-unbinding',
    channelId: CHANNEL.unbinding,
    deviceId: p.deviceId,
    body: {
      merchantId: MERCHANT_ID,
      additionalInfo: {
        authCode: p.authCode,
        accessToken: p.accessToken,
      },
    },
  });
}

// Account binding persistence: exchange the one-time authCode for the wallet
// token and store it on the user, so subsequent debits reuse it (actionPay).
interface LinkPayload {
  userId: string;
  authCode: string;
  phoneNo?: string;
}

async function actionLink(p: LinkPayload) {
  if (!db) throw new Error('binding storage unavailable (service role not configured)');
  if (!p.userId || !p.authCode) throw new Error('userId and authCode are required');
  const { accessToken, expiresAt } = await exchangeCustomerToken(p.authCode);
  const { error } = await db
    .from('users')
    .update({
      astrapay_customer_token: accessToken,
      astrapay_token_expires_at: expiresAt,
      astrapay_bound_at: new Date().toISOString(),
      astrapay_phone: p.phoneNo ?? null,
    })
    .eq('id', p.userId);
  if (error) throw new Error(`store token failed: ${error.message}`);
  return { bound: true, expiresAt };
}

interface UnlinkPayload {
  userId: string;
}

async function actionUnlink(p: UnlinkPayload) {
  if (!db) throw new Error('binding storage unavailable (service role not configured)');
  if (!p.userId) throw new Error('userId is required');
  // Best-effort unbind at AstraPay using the stored token, then clear locally.
  const { data } = await db
    .from('users')
    .select('astrapay_customer_token')
    .eq('id', p.userId)
    .single();
  const token = (data as { astrapay_customer_token?: string } | null)?.astrapay_customer_token;
  let unbind: unknown = null;
  if (token) {
    try {
      unbind = (await actionUnbind({ accessToken: token })).json;
    } catch (_) {
      // ignore — clearing locally is what matters for the demo
    }
  }
  const { error } = await db
    .from('users')
    .update({
      astrapay_customer_token: null,
      astrapay_token_expires_at: null,
      astrapay_bound_at: null,
      astrapay_phone: null,
    })
    .eq('id', p.userId);
  if (error) throw new Error(`clear token failed: ${error.message}`);
  return { bound: false, unbind };
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  if (!CLIENT_ID || !CLIENT_SECRET || !MERCHANT_ID || !PRIVATE_KEY_PEM) {
    return json(
      { error: 'AstraPay credentials not configured (set Edge Function secrets).' },
      500,
    );
  }

  let payload: { action?: string; [k: string]: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  try {
    switch (payload.action) {
      case 'bind':
        return json(await actionBind(payload as unknown as BindPayload));
      case 'pay':
        return json(await actionPay(payload as unknown as PayPayload));
      case 'status':
        return json(await actionStatus(payload as unknown as StatusPayload));
      case 'unbind':
        return json(await actionUnbind(payload as unknown as UnbindPayload));
      case 'link':
        return json(await actionLink(payload as unknown as LinkPayload));
      case 'unlink':
        return json(await actionUnlink(payload as unknown as UnlinkPayload));
      case 'topup':
        return json(await actionTopup(payload as unknown as TopupPayload));
      default:
        return json({ error: `unknown action: ${payload.action}` }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 502);
  }
});
