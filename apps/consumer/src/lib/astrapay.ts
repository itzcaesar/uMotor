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
import * as WebBrowser from 'expo-web-browser';
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
    const r = await WebBrowser.openAuthSessionAsync(url, finishUrl);
    // 'cancel'/'dismiss' = user closed the sheet. It may still have settled, so
    // we poll briefly; but we don't make them wait the full window on a cancel.
    dismissed = r.type !== 'success';
  }

  const status = await pollStatus(
    pay.partnerReferenceNo,
    pay.json.referenceNo,
    amount,
    dismissed ? 6 : 45,
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

/**
 * Link the user's AstraPay wallet: start binding → open the webview (phone +
 * OTP 111111 + PIN) → capture the authCode from the finish redirect → exchange
 * + persist it server-side. Resolves true once bound. Live only — the mock has
 * no wallet to bind, so this is a no-op there.
 */
export async function bindAstraPay(userId: string, opts: BindOpts = {}): Promise<boolean> {
  if (!ASTRAPAY_LIVE) return false;

  const finishBindingUrl = Linking.createURL('astrapay/bound');
  const res = await astrapayBind(supabase, {
    finishBindingUrl,
    externalUid: userId,
    phoneNo: opts.phone,
    name: opts.name,
    email: opts.email,
  });
  const url = res.json.webRedirectUrl ?? res.json.redirectUrl;
  if (!url) {
    throw new Error(res.json.responseMessage || 'Gagal memulai binding AstraPay.');
  }

  const result = await WebBrowser.openAuthSessionAsync(url, finishBindingUrl);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Binding dibatalkan.');
  }

  // AstraPay appends the authCode to the finish URL (param name varies).
  const params = Linking.parse(result.url).queryParams ?? {};
  const raw = params.authCode ?? params.auth_code ?? params.code;
  const authCode = Array.isArray(raw) ? raw[0] : raw;
  if (!authCode) {
    throw new Error('authCode tidak diterima dari AstraPay.');
  }

  const link = await astrapayLink(supabase, { userId, authCode, phoneNo: opts.phone });
  return !!link.bound;
}

/** Unlink the user's AstraPay wallet (unbind + clear the stored token). */
export async function unbindAstraPay(userId: string): Promise<void> {
  if (!ASTRAPAY_LIVE) return;
  await astrapayUnlink(supabase, { userId });
}
