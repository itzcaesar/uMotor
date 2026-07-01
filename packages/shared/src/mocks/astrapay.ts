export type AstraPayStage = 'connecting' | 'processing' | 'success';

export interface AstraPayResult {
  success: true;
  txId: string;
  amount: number;
  description: string;
  method: 'astrapay';
  /** ISO timestamp the payment settled — for receipts. */
  paidAt: string;
  /** AstraPay referenceNo (live). Mock reuses txId so call sites always have one. */
  ref?: string;
  /** Our partnerReferenceNo (live only) — for reconciliation against AstraPay. */
  partnerRef?: string;
  /**
   * Live only: the user completed the flow but AstraPay hadn't settled the debit
   * before the status poll timed out. Accepted optimistically — the
   * astrapay-webhook stamps settlement when it lands. The mock never sets this.
   */
  pending?: boolean;
}

export interface PayOptions {
  /** Progress callback for the staged payment overlay. */
  onStage?: (stage: AstraPayStage) => void;
  /** Bound-wallet payer id — live flow reuses a stored token; mock ignores it. */
  userId?: string;
}

/** Total mocked latency, split across the connecting → processing → success stages. */
export const ASTRAPAY_LATENCY_MS = 1500;

/**
 * Fake AstraPay payment. Resolves after ~1.5s and never fails in the demo build.
 * The optional `onStage` callback drives the branded payment overlay through its
 * connecting → processing → success states; older call sites that ignore it (and
 * the extra result fields) keep working unchanged.
 */
export function payAstraPay(
  amount: number,
  description: string,
  opts: PayOptions = {},
): Promise<AstraPayResult> {
  const { onStage } = opts;
  return new Promise((resolve) => {
    onStage?.('connecting');
    setTimeout(() => onStage?.('processing'), Math.round(ASTRAPAY_LATENCY_MS / 3));
    setTimeout(() => {
      onStage?.('success');
      const txId = 'AP-' + Math.random().toString(36).slice(2, 10).toUpperCase();
      resolve({
        success: true,
        txId,
        amount,
        description,
        method: 'astrapay',
        paidAt: new Date().toISOString(),
        ref: txId,
      });
    }, ASTRAPAY_LATENCY_MS);
  });
}
