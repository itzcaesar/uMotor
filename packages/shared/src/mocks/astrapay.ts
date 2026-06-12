export interface AstraPayResult {
  success: true;
  txId: string;
}

/** Fake AstraPay payment. Resolves after 1.5s. Never fails in demo build. */
export function payAstraPay(amount: number, description: string): Promise<AstraPayResult> {
  void amount;
  void description;
  return new Promise((resolve) =>
    setTimeout(
      () => resolve({ success: true, txId: 'AP-' + Math.random().toString(36).slice(2, 10).toUpperCase() }),
      1500,
    ),
  );
}
