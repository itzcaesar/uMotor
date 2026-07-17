// Imperative bridge to the in-app AstraPay WebView modal.
//
// Mobile best practice: keep the AstraPay binding/payment flow INSIDE the app
// (an embedded WebView) instead of bouncing to an external custom-tab. The bind/
// pay helpers in `astrapay.ts` are plain async functions, so we expose a
// promise-returning opener: it parks a request in this store, the mounted
// <AstraPayBrowserHost> (root _layout) renders the WebView, intercepts the
// finish redirect, and resolves the promise. See components/AstraPayBrowser.tsx.

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { create } from 'zustand';

export interface AstraPayBrowserResult {
  type: 'success' | 'cancel';
  /** The intercepted finish URL (carries the authCode on binding). */
  url?: string;
}

interface PendingRequest {
  url: string;
  /** Local finish URL to intercept (custom scheme); navigation here = done. */
  finishUrl: string;
  title: string;
  /** Payment pages don't redirect back, so watch for the success screen text. */
  detectSuccess?: boolean;
  resolve: (r: AstraPayBrowserResult) => void;
}

interface BrowserState {
  request: PendingRequest | null;
  open: (req: PendingRequest) => void;
  finish: (r: AstraPayBrowserResult) => void;
}

export const useAstraPayBrowser = create<BrowserState>((set, get) => ({
  request: null,
  open: (req) => {
    // Defensive: if something is already open, cancel it first.
    const existing = get().request;
    if (existing) existing.resolve({ type: 'cancel' });
    set({ request: req });
  },
  finish: (r) => {
    const req = get().request;
    if (!req) return;
    set({ request: null });
    req.resolve(r);
  },
}));

/**
 * Open the AstraPay flow and resolve when it finishes/closes.
 *
 * Native → in-app WebView modal (the user never leaves the app). Web account
 * binding → same-tab redirect and callback resume. Web payments retain the
 * `expo-web-browser` popup because their longer status-polling promise must stay
 * alive and the cross-origin page cannot be framed.
 */
export async function openAstraPayBrowser(opts: {
  url: string;
  finishUrl: string;
  title?: string;
  detectSuccess?: boolean;
  /** Web login can replace the current tab; payments keep their popup flow. */
  webMode?: 'popup' | 'same-tab';
}): Promise<AstraPayBrowserResult> {
  if (Platform.OS === 'web') {
    if (opts.webMode === 'same-tab') {
      // Account binding persists its resume payload before reaching here. The
      // callback consumes it after AstraPay navigates this tab back to uMotor,
      // so this promise intentionally never resolves in this document.
      window.location.assign(opts.url);
      return new Promise(() => {});
    }
    try {
      const r = await WebBrowser.openAuthSessionAsync(opts.url, opts.finishUrl);
      return r.type === 'success' && r.url ? { type: 'success', url: r.url } : { type: 'cancel' };
    } catch {
      return { type: 'cancel' };
    }
  }
  return new Promise((resolve) => {
    useAstraPayBrowser.getState().open({
      url: opts.url,
      finishUrl: opts.finishUrl,
      title: opts.title ?? 'AstraPay',
      detectSuccess: opts.detectSuccess,
      resolve,
    });
  });
}
