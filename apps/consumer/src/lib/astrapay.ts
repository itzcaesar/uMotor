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

export const ASTRAPAY_LIVE = (process.env.EXPO_PUBLIC_ASTRAPAY_LIVE ?? '') === '1';

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
 * Single AstraPay entry point for every checkout flow — live SNAP when
 * EXPO_PUBLIC_ASTRAPAY_LIVE=1, the mock otherwise. Same signature as the mock,
 * so call sites swap `payAstraPay` → `payAstraPaySmart` with no other change.
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
 * Returns whether the token was actually stored (`walletBound`). It does NOT
 * throw once the webview has run: the redirect back to a custom scheme is
 * unreliable (esp. in Expo Go — it may return success/dismiss/cancel and may or
 * may not carry the authCode). So login proceeds regardless; if the token wasn't
 * captured, payments simply fall back to push-payment. Only a hard failure
 * *before* the webview (no redirect URL) throws.
 */
export async function bindAstraPay(
  userId: string,
  opts: BindOpts = {},
): Promise<{ walletBound: boolean }> {
  if (!ASTRAPAY_LIVE) return { walletBound: false };

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
  const returnUrl = result.type === 'success' ? result.url : undefined;
  const authCode = (returnUrl ? extractAuthCode(returnUrl) : undefined) ?? responseAuthCode;
  if (!authCode) {
    console.warn(`[astrapay] bind: no authCode (webview type=${result.type})`);
    return { walletBound: false };
  }

  try {
    const link = await astrapayLink(supabase, { userId, authCode, phoneNo: phone });
    return { walletBound: !!link.bound };
  } catch (e) {
    console.warn('[astrapay] link failed', e);
    return { walletBound: false };
  }
}

/** Unlink the user's AstraPay wallet (unbind + clear the stored token). */
export async function unbindAstraPay(userId: string): Promise<void> {
  if (!ASTRAPAY_LIVE) return;
  await astrapayUnlink(supabase, { userId });
}
