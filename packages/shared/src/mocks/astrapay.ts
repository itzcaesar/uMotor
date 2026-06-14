export type AstraPayStage = 'connecting' | 'processing' | 'success';

export interface AstraPayResult {
  success: true;
  txId: string;
  amount: number;
  description: string;
  method: 'astrapay';
  /** ISO timestamp the payment settled — for receipts. */
  paidAt: string;
}

export interface PayOptions {
  /** Progress callback for the staged payment overlay. */
  onStage?: (stage: AstraPayStage) => void;
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
      resolve({
        success: true,
        txId: 'AP-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
        amount,
        description,
        method: 'astrapay',
        paidAt: new Date().toISOString(),
      });
    }, ASTRAPAY_LATENCY_MS);
  });
}
