// Client-side wrapper for the `astrapay` Supabase Edge Function.
//
// The apps never talk to AstraPay directly — they invoke the Edge Function,
// which holds the secret + RSA key and does the SNAP signing. This module is
// the typed bridge. See supabase/functions/astrapay/index.ts.
//
// The active sandbox channel is **Saldo AstraPay**: a one-time account binding
// (webview, OTP 111111 + PIN) links the wallet, then debit payments charge it.
// Both binding and debit return a `webRedirectUrl` the app must open so the
// user can confirm; the app then polls `status` until SUCCESS / FAILED.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AstraPayTxnStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REJECTED';

export interface AstraPaySnapResponse {
  responseCode?: string;
  responseMessage?: string;
  referenceNo?: string;
  redirectUrl?: string;
  webRedirectUrl?: string;
  // SNAP returns numeric codes ("00" success, "03" pending, …); normalise via
  // normalizeTxnStatus rather than comparing directly.
  transactionStatus?: string;
  latestTransactionStatus?: string;
  additionalInfo?: Record<string, unknown>;
}

interface InvokeResult {
  ok: boolean;
  status: number;
  json: AstraPaySnapResponse;
  partnerReferenceNo?: string;
  error?: string;
}

/** Is the live AstraPay integration enabled? Apps pass their public env flag. */
export function isAstraPayLive(flag?: string | null): boolean {
  return flag === '1' || flag === 'true';
}

async function invoke(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<InvokeResult> {
  return invokeRaw<InvokeResult>(supabase, body);
}

// Lower-level invoke for actions whose response isn't the SNAP txn envelope
// (e.g. link/unlink return { bound, ... }).
async function invokeRaw<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('astrapay', { body });
  if (error) throw new Error(error.message);
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export interface BindArgs {
  finishBindingUrl: string;
  externalUid: string;
  phoneNo?: string;
  name?: string;
  email?: string;
}

/** Start AstraPay account binding. Open the returned webRedirectUrl. */
export function astrapayBind(supabase: SupabaseClient, args: BindArgs) {
  return invoke(supabase, { action: 'bind', ...args });
}

export interface LinkArgs {
  userId: string;
  /** One-time authCode from the binding finish redirect. */
  authCode: string;
  phoneNo?: string;
}

/**
 * Finish binding: exchange the authCode for the wallet token and persist it
 * server-side, so later debits reuse it (skip the push-payment re-login).
 */
export function astrapayLink(supabase: SupabaseClient, args: LinkArgs) {
  return invokeRaw<{ bound: boolean; expiresAt?: string }>(supabase, {
    action: 'link',
    ...args,
  });
}

export interface UnlinkArgs {
  userId: string;
}

/** Unbind the wallet at AstraPay and clear the stored token. */
export function astrapayUnlink(supabase: SupabaseClient, args: UnlinkArgs) {
  return invokeRaw<{ bound: boolean }>(supabase, { action: 'unlink', ...args });
}

export interface PayArgs {
  amount: number; // integer Rupiah
  description?: string;
  /** authCode from a prior binding (optional — push-payment webview can auth). */
  authCode?: string;
  customerToken?: string;
  partnerReferenceNo?: string;
  /** If the user has bound their wallet, the server reuses the stored token. */
  userId?: string;
}

/** Charge AstraPay. Open the returned webRedirectUrl, then poll status. */
export function astrapayPay(supabase: SupabaseClient, args: PayArgs) {
  return invoke(supabase, { action: 'pay', ...args });
}

export interface StatusArgs {
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  amount: number; // mandatory for debit/status
}

const SUCCESS = new Set(['00', 'APP', 'SUCCESS']);
const PENDING = new Set(['01', '02', '03', '04', 'PND', 'PENDING', '']);

/** Normalise SNAP `latestTransactionStatus` (numeric) + legacy codes. */
export function normalizeTxnStatus(
  res: AstraPaySnapResponse,
): AstraPayTxnStatus {
  const raw = String(
    res.latestTransactionStatus ?? res.transactionStatus ?? '',
  ).toUpperCase();
  if (SUCCESS.has(raw)) return 'SUCCESS';
  if (PENDING.has(raw)) return 'PENDING';
  return raw === 'REJ' || raw === 'REJECTED' ? 'REJECTED' : 'FAILED';
}

/** Inquire a payment's status (poll this after the webview returns). */
export function astrapayStatus(supabase: SupabaseClient, args: StatusArgs) {
  return invoke(supabase, { action: 'status', ...args });
}

export interface UnbindArgs {
  authCode?: string;
  accessToken?: string;
}

export function astrapayUnbind(supabase: SupabaseClient, args: UnbindArgs) {
  return invoke(supabase, { action: 'unbind', ...args });
}
