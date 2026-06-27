import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  formatRp,
  type AstraPayResult,
  type AstraPayStage,
} from '@umotor/shared';
import { payAstraPaySmart } from '@/lib/astrapay';
import { useAstraPayBrowser } from '@/lib/astrapay-browser';

const STAGE_COPY: Record<AstraPayStage, string> = {
  connecting: 'Menghubungkan ke AstraPay…',
  processing: 'Memproses pembayaran…',
  success: 'Pembayaran berhasil',
};

/**
 * Drives a payment through the shared AstraPay mock while exposing its staged
 * progress for <PaymentOverlay>. Lets every checkout flow share one branded,
 * consistent payment experience instead of an ad-hoc inline spinner.
 */
export function usePayment() {
  const [stage, setStage] = useState<AstraPayStage | null>(null);
  const pay = useCallback(
    (amount: number, description: string, opts?: { userId?: string }): Promise<AstraPayResult> => {
      setStage('connecting');
      // Live SNAP when EXPO_PUBLIC_ASTRAPAY_LIVE=1; mock otherwise (demo default).
      return payAstraPaySmart(amount, description, { onStage: setStage, userId: opts?.userId }).catch((e) => {
        setStage(null); // dismiss the overlay so the caller can surface the error
        throw e;
      });
    },
    [],
  );
  const clear = useCallback(() => setStage(null), []);
  return { stage, pay, clear, busy: stage !== null };
}

/** Branded AstraPay payment overlay. Render once per screen; pass the hook's stage. */
export function PaymentOverlay({ stage, amount }: { stage: AstraPayStage | null; amount?: number }) {
  const done = stage === 'success';
  // While the in-app AstraPay WebView is up, it IS the UI — don't stack this
  // overlay Modal under it (stacked Modals mis-render on iOS). It reappears for
  // the status-poll phase once the WebView closes.
  const browserOpen = useAstraPayBrowser((s) => s.request != null);
  return (
    <Modal visible={stage !== null && !browserOpen} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot}>
              <Ionicons name="wallet" size={16} color="#fff" />
            </View>
            <Text style={styles.brand}>AstraPay</Text>
          </View>

          <View style={styles.body}>
            {done ? (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={34} color="#fff" />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}
            <Text style={[styles.stageText, done && { color: colors.accent }]}>
              {stage ? STAGE_COPY[stage] : ''}
            </Text>
            {amount != null && <Text style={styles.amount}>{formatRp(amount)}</Text>}
          </View>

          {!done && <Text style={styles.hint}>Mohon tunggu, jangan tutup aplikasi…</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,23,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontWeight: '800', color: colors.primary, fontSize: 15 },
  body: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  check: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageText: { color: '#0b1727', fontWeight: '700', fontSize: 15 },
  amount: { color: '#667085', fontSize: 14 },
  hint: { color: '#98a2b3', fontSize: 12, textAlign: 'center' },
});
