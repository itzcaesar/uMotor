// Live AstraPay (SNAP) payment + account-binding flows for the consumer app.
//
// Mirrors the shape of the shared `payAstraPay` mock so call sites and the
// branded <PaymentOverlay> work unchanged — `usePayment` picks this when
// EXPO_PUBLIC_ASTRAPAY_LIVE=1, otherwise the mock.
//
// Active sandbox channel = Saldo AstraPay. The wallet can be linked once via
// account binding (webview: phone + OTP 111111 + PIN); after that, debits reuse
// the stored token server-side. If not bound, each debit uses push-payment (the
// webview authenticates inline). Either way we open the returned webRedirectUrl
// when present, then poll status until terminal.

import * as Linking from 'expo-linking';
import {
  astrapayBind,
  astrapayLink,
  astrapayPay,
  astrapayStatus,
  astrapayUnlink,
  normalizeTxnStatus,
  payAstraPay,
  type AstraPayResult,
  type AstraPayStage,
  type AstraPayTxnStatus,
  type PayOptions,
} from '@umotor/shared';
import { openAstraPayBrowser } from './astrapay-browser';
import { supabase } from './supabase';

// Live AstraPay is the default — the app talks to the real SNAP sandbox. Set
// EXPO_PUBLIC_ASTRAPAY_LIVE=0 only for offline local dev (no secrets); there is
// no in-app mock/demo payment path otherwise.
export const ASTRAPAY_LIVE = (process.env.EXPO_PUBLIC_ASTRAPAY_LIVE ?? '1') !== '0';

const STATUS_COPY: Record<AstraPayTxnStatus, string> = {
  SUCCESS: 'berhasil',
  FAILED: 'gagal',
  REJECTED: 'ditolak',
  PENDING: 'masih diproses',
};

async function pollStatus(
  partnerReferenceNo: string | undefined,
  referenceNo: string | undefined,
  amount: number,
  maxTries = 45,
): Promise<AstraPayTxnStatus> {
  // Poll up to maxTries × 2s. The webview usually returns before this.
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await astrapayStatus(supabase, {
        originalPartnerReferenceNo: partnerReferenceNo,
        originalReferenceNo: referenceNo,
        amount,
      });
      // "Transaction Not Found" early on just means it isn't visible yet — keep polling.
      if (res.json.responseCode && !res.json.responseCode.startsWith('404')) {
        const status = normalizeTxnStatus(res.json);
        if (status !== 'PENDING') return status;
      }
    } catch {
      // Transient network/invoke blip — don't fail a payment that may have
      // settled; keep polling.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 'PENDING';
}

/**
 * Live AstraPay payment (Saldo AstraPay). If the user is bound, the server
 * reuses their stored wallet token and the debit may settle without a webview;
 * otherwise it returns a push-payment webRedirectUrl we open. Either way we poll
 * status until terminal. Drop-in for the shared `payAstraPay` mock.
 */
export async function payAstraPayLive(
  amount: number,
  description: string,
  opts: PayOptions = {},
): Promise<AstraPayResult> {
  const { onStage, userId } = opts;
  onStage?.('connecting');

  const pay = await astrapayPay(supabase, { amount, description, userId });
  if (!pay.json.responseCode?.startsWith('200')) {
    throw new Error(pay.json.responseMessage || 'Gagal memulai pembayaran AstraPay.');
  }

  onStage?.('processing');
  const url = pay.json.webRedirectUrl ?? pay.json.redirectUrl;
  let dismissed = false;
  if (url) {
    const finishUrl = Linking.createURL('astrapay/paid');
    // In-app WebView — the user never leaves the app. AstraPay's push-payment
    // success page may not redirect to our finish URL, so the user taps Close
    // after "Transaksi Berhasil"; the status poll below is the real signal.
    const r = await openAstraPayBrowser({
      url,
      finishUrl,
      title: 'Pembayaran AstraPay',
      detectSuccess: true,
    });
    dismissed = r.type !== 'success';
  }

  const status = await pollStatus(
    pay.partnerReferenceNo,
    pay.json.referenceNo,
    amount,
    dismissed ? 15 : 45,
  );
  if (status !== 'SUCCESS') {
    throw new Error(
      dismissed && status === 'PENDING'
        ? 'Pembayaran dibatalkan.'
        : `Pembayaran AstraPay ${STATUS_COPY[status]}.`,
    );
  }

  onStage?.('success');
  return {
    success: true,
    txId: pay.json.referenceNo ?? pay.partnerReferenceNo ?? 'AP',
    amount,
    description,
    method: 'astrapay',
    paidAt: new Date().toISOString(),
    ref: pay.json.referenceNo,
    partnerRef: pay.partnerReferenceNo,
  };
}

/**
 * Single AstraPay entry point for every checkout flow. Live SNAP by default (the
 * real sandbox); only an explicit EXPO_PUBLIC_ASTRAPAY_LIVE=0 (offline dev) falls
 * back to the mock. Same signature either way.
 */
export const payAstraPaySmart = ASTRAPAY_LIVE ? payAstraPayLive : payAstraPay;

interface BindOpts {
  phone?: string;
  name?: string;
  email?: string;
}

/** Pull the authCode AstraPay appends to the binding finish redirect. The param
 *  name + location vary (query vs #fragment), so check both, several names. */
function extractAuthCode(rawUrl: string): string | undefined {
  const pick = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  try {
    const q = Linking.parse(rawUrl).queryParams ?? {};
    const fromQuery = pick(q.authCode) ?? pick(q.auth_code) ?? pick(q.code);
    if (fromQuery) return fromQuery;
  } catch {
    // fall through to fragment parsing
  }
  const hash = rawUrl.split('#')[1];
  if (hash) {
    for (const part of hash.split('&')) {
      const [k, v] = part.split('=');
      if (v && (k === 'authCode' || k === 'auth_code' || k === 'code')) {
        try {
          return decodeURIComponent(v);
        } catch {
          return v;
        }
      }
    }
  }
  return undefined;
}

/**
 * Link the user's AstraPay wallet: start binding → open the webview (phone +
 * OTP 111111 + PIN) → best-effort capture the authCode from the finish redirect
 * → exchange + persist the wallet token server-side.
 *
 * Returns whether the wallet token was stored (`walletBound`) and whether the
 * user actually completed the AstraPay webview (`completed` — the page redirected
 * back after a real OTP/PIN authorization, vs the user closing it). Login uses
 * `completed` to gate entry strictly behind AstraPay while tolerating the
 * occasionally-flaky post-auth token capture. It does NOT throw once the webview
 * has run; only a hard failure *before* the webview (no redirect URL) throws.
 */
export async function bindAstraPay(
  userId: string,
  opts: BindOpts = {},
): Promise<{ walletBound: boolean; completed: boolean }> {
  if (!ASTRAPAY_LIVE) return { walletBound: false, completed: false };

  // AstraPay expects digits only — Profile passes "0853-4886-1424" (dashes),
  // login passes digits; normalize both here.
  const phone = opts.phone?.replace(/\D/g, '');
  const finishBindingUrl = Linking.createURL('astrapay/bound');
  const res = await astrapayBind(supabase, {
    finishBindingUrl,
    externalUid: userId,
    phoneNo: phone,
    name: opts.name,
    email: opts.email,
  });
  const url = res.json.webRedirectUrl ?? res.json.redirectUrl;
  if (!url) {
    throw new Error(res.json.responseMessage || 'Gagal memulai binding AstraPay.');
  }

  // AstraPay returns the authCode in the bind response itself (additionalInfo) —
  // the reliable source. The user still opens the webview to authorize (OTP
  // 111111 + PIN); we then exchange that authCode. The redirect MAY also carry a
  // (post-auth) authCode — prefer it if the webview happens to surface one.
  const responseAuthCode = (res.json.additionalInfo as { authCode?: string } | undefined)?.authCode;

  const result = await openAstraPayBrowser({
    url,
    finishUrl: finishBindingUrl,
    title: 'Hubungkan AstraPay',
  });
  // The webview resolves 'success' only when AstraPay redirects back after a real
  // OTP/PIN authorization — a reliable "the user went through AstraPay" signal.
  const completed = result.type === 'success';
  const returnUrl = completed ? result.url : undefined;
  const authCode = (returnUrl ? extractAuthCode(returnUrl) : undefined) ?? responseAuthCode;
  if (!authCode) {
    console.warn(`[astrapay] bind: no authCode (webview type=${result.type})`);
    return { walletBound: false, completed };
  }

  try {
    const link = await astrapayLink(supabase, { userId, authCode, phoneNo: phone });
    return { walletBound: !!link.bound, completed };
  } catch (e) {
    console.warn('[astrapay] link failed', e);
    return { walletBound: false, completed };
  }
}

/** Unlink the user's AstraPay wallet (unbind + clear the stored token). */
export async function unbindAstraPay(userId: string): Promise<void> {
  if (!ASTRAPAY_LIVE) return;
  await astrapayUnlink(supabase, { userId });
}

/**
 * Has this user already linked their AstraPay wallet? Lets login skip the
 * OTP/PIN binding webview for a returning user — the local session is cleared on
 * logout, but the wallet link persists on the users row across sessions.
 *
 * Token expiry is intentionally ignored: a lapsed token doesn't unlink the
 * wallet (payments just fall back to push-payment), so it must not force a
 * re-bind at login. Refreshing the token is a deliberate Profile action.
 */
export async function isAstraPayBound(userId: string): Promise<boolean> {
  if (!ASTRAPAY_LIVE) return false;
  try {
    const { data } = await supabase
      .from('users')
      .select('astrapay_bound_at')
      .eq('id', userId)
      .single();
    return !!(data as { astrapay_bound_at?: string | null } | null)?.astrapay_bound_at;
  } catch {
    return false;
  }
}
