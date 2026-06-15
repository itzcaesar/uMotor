import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, type MotoScore } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { ScoreGauge } from '@/components/Gauge';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface HistoryRow {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
}

type Kind = 'loan' | 'insurance' | 'installment';

const PRODUCTS: {
  kind: Kind;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  min: number;
}[] = [
  {
    kind: 'loan',
    icon: 'flash',
    title: 'Pinjaman darurat',
    desc: 'Cair dalam 5 menit untuk servis mendadak',
    min: 650,
  },
  {
    kind: 'insurance',
    icon: 'shield-checkmark',
    title: 'Asuransi motor',
    desc: 'Premi dipersonalisasi dari pola perawatan motormu',
    min: 600,
  },
  {
    kind: 'installment',
    icon: 'card',
    title: 'Cicilan sparepart 0%',
    desc: 'Beli sparepart, bayar bertahap tanpa bunga',
    min: 700,
  },
];

// Instant underwriting from the MotoScore — the proposal's core innovation:
// maintenance behaviour, not bank credit history, sets the offer.
function buildOffer(kind: Kind, score: number) {
  const round = (n: number, step: number) => Math.round(n / step) * step;
  if (kind === 'loan') {
    const amount = Math.min(5_000_000, Math.max(500_000, round((score - 600) * 20_000, 50_000)));
    return {
      amount,
      headline: formatRp(amount),
      unit: 'Limit pinjaman disetujui',
      detail: 'Tenor 3–12 bulan · bunga rendah · cair instan ke AstraPay',
      action: 'Cairkan ke AstraPay',
    };
  }
  if (kind === 'insurance') {
    const premium = Math.max(120_000, round(350_000 - (score - 600) * 600, 10_000));
    return {
      amount: premium,
      headline: `${formatRp(premium)}/th`,
      unit: 'Estimasi premi tahunan',
      detail: 'TLO + santunan kecelakaan · premi turun saat skormu naik',
      action: 'Aktifkan asuransi',
    };
  }
  const limit = Math.min(10_000_000, Math.max(1_000_000, round((score - 650) * 15_000, 100_000)));
  return {
    amount: limit,
    headline: formatRp(limit),
    unit: 'Limit cicilan 0%',
    detail: 'Beli sparepart sekarang, bayar 3–6× tanpa bunga',
    action: 'Aktifkan limit',
  };
}

export default function MotoScoreScreen() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<(typeof PRODUCTS)[number] | null>(null);
  const [stage, setStage] = useState<'review' | 'processing' | 'approved'>('review');
  const [finalizing, setFinalizing] = useState(false);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const data = useQuery({
    queryKey: ['motoscore', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 30_000,
    queryFn: async () => {
      const [score, history] = await Promise.all([
        supabase.from('motoscore').select('*').eq('user_id', userId!).single(),
        supabase
          .from('motoscore_history')
          .select('*')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      return {
        score: (score.data as MotoScore | null)?.score ?? 600,
        history: (history.data ?? []) as HistoryRow[],
      };
    },
  });

  // Score changes land live (e.g. +5 right after the partner completes the service).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('motoscore-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'motoscore', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['motoscore', userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  const score = data.data?.score ?? 600;
  const offer = selected ? buildOffer(selected.kind, score) : null;

  const openOffer = (p: (typeof PRODUCTS)[number]) => {
    setSelected(p);
    setStage('review');
  };
  const closeOffer = () => {
    if (finalizing) return;
    setSelected(null);
  };

  // review → processing (instant "underwriting") → approved.
  const submitApplication = () => {
    setStage('processing');
    setTimeout(() => setStage('approved'), 1600);
  };

  // Finalize: disburse a loan to AstraPay, or activate insurance/installment.
  const finalize = async () => {
    if (!userId || !selected || !offer || finalizing) return;
    setFinalizing(true);
    try {
      if (selected.kind === 'loan') {
        const { data: u } = await supabase
          .from('users')
          .select('astrapay_balance')
          .eq('id', userId)
          .single();
        if (u) {
          await supabase
            .from('users')
            .update({ astrapay_balance: u.astrapay_balance + offer.amount })
            .eq('id', userId);
        }
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'finance',
          title: 'Pinjaman cair',
          body: `${formatRp(offer.amount)} masuk ke saldo AstraPay. Tenor fleksibel, atur di menu Finance.`,
        });
      } else {
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'finance',
          title: selected.kind === 'insurance' ? 'Asuransi aktif' : 'Limit cicilan aktif',
          body:
            selected.kind === 'insurance'
              ? `Asuransi motormu aktif. Premi ${offer.headline}.`
              : `Limit cicilan 0% ${offer.headline} siap dipakai di marketplace.`,
        });
      }
      qc.invalidateQueries();
      const msg =
        selected.kind === 'loan'
          ? `${formatRp(offer.amount)} sudah masuk ke saldo AstraPay.`
          : selected.kind === 'insurance'
            ? 'Asuransi motormu aktif.'
            : 'Limit cicilan 0% aktif.';
      setSelected(null);
      Alert.alert('Berhasil', msg);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      <Card style={styles.gaugeCard}>
        <ScoreGauge score={score} />
        <Text style={styles.gaugeHint}>
          Dihitung dari ketepatan servis, pembayaran tagihan, dan kondisi motormu — bukan riwayat
          kredit bank.
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Produk yang terbuka untukmu</Text>
      {PRODUCTS.map((p) => {
        const unlocked = score >= p.min;
        const productOffer = unlocked ? buildOffer(p.kind, score) : null;
        return (
          <Pressable
            key={p.title}
            disabled={!unlocked}
            onPress={() => openOffer(p)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !unlocked }}
            accessibilityLabel={
              unlocked ? `Buka ${p.title}` : `${p.title}, terkunci, butuh skor ${p.min} atau lebih`
            }
          >
            <Card style={[styles.product, !unlocked && styles.productLocked]}>
              <View style={[styles.productIcon, unlocked && styles.productIconUnlocked]}>
                <Ionicons name={p.icon} size={20} color={unlocked ? '#fff' : '#98a2b3'} />
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productTitle}>{p.title}</Text>
                <Text style={styles.productDesc}>{p.desc}</Text>
                {productOffer ? (
                  <Text style={styles.productOffer}>
                    {productOffer.headline} · {productOffer.unit}
                  </Text>
                ) : (
                  <Text style={styles.productNeed}>Butuh skor {p.min}+ untuk membuka</Text>
                )}
              </View>
              <Ionicons
                name={unlocked ? 'chevron-forward' : 'lock-closed'}
                size={18}
                color={unlocked ? colors.primary : '#cbd5e1'}
              />
            </Card>
          </Pressable>
        );
      })}

      <Text style={styles.sectionTitle}>Riwayat skor</Text>
      <Card>
        {(data.data?.history ?? []).map((h) => (
          <View key={h.id} style={styles.histRow}>
            <View style={[styles.delta, h.delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
              <Text style={[styles.deltaText, { color: h.delta >= 0 ? colors.accent : colors.danger }]}>
                {h.delta >= 0 ? `+${h.delta}` : h.delta}
              </Text>
            </View>
            <View style={styles.histInfo}>
              <Text style={styles.histReason}>{h.reason}</Text>
              <Text style={styles.histDate}>
                {new Date(h.created_at).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        ))}
        {data.data?.history.length === 0 && <Text style={styles.empty}>Belum ada riwayat.</Text>}
      </Card>

      {/* Application modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeOffer}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: Math.max(36, insets.bottom + 12) }, r.isTablet && styles.sheetWide]}>
            {selected && offer && (
              <>
                <View style={styles.sheetHandle} />
                {stage === 'review' && (
                  <>
                    <View style={styles.sheetIcon}>
                      <Ionicons name={selected.icon} size={26} color="#fff" />
                    </View>
                    <Text style={styles.sheetTitle}>{selected.title}</Text>
                    <Text style={styles.sheetDetail}>{offer.detail}</Text>
                    <View style={styles.offerBox}>
                      <Text style={styles.offerLabel}>{offer.unit}</Text>
                      <Text style={styles.offerValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {offer.headline}
                      </Text>
                      <View style={styles.scoreTag}>
                        <Ionicons name="trending-up" size={13} color={colors.accent} />
                        <Text style={styles.scoreTagText}>Berdasarkan MotoScore {score}</Text>
                      </View>
                    </View>
                    <Pressable style={styles.primaryBtn} onPress={submitApplication}>
                      <Text style={styles.primaryBtnText}>Ajukan sekarang</Text>
                    </Pressable>
                    <Pressable onPress={closeOffer}>
                      <Text style={styles.closeText}>Nanti saja</Text>
                    </Pressable>
                  </>
                )}
                {stage === 'processing' && (
                  <View style={styles.processing}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.processingText}>Menganalisis MotoScore…</Text>
                    <Text style={styles.processingSub}>Tanpa BI Checking. Tanpa jaminan.</Text>
                  </View>
                )}
                {stage === 'approved' && (
                  <>
                    <View style={[styles.sheetIcon, styles.sheetIconOk]}>
                      <Ionicons name="checkmark" size={30} color="#fff" />
                    </View>
                    <Text style={styles.sheetTitle}>Disetujui!</Text>
                    <Text style={styles.sheetDetail}>{offer.unit}</Text>
                    <Text style={styles.approvedValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {offer.headline}
                    </Text>
                    <Pressable
                      style={[styles.primaryBtn, finalizing && styles.btnBusy]}
                      onPress={finalize}
                      disabled={finalizing}
                    >
                      {finalizing ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>{offer.action}</Text>
                      )}
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  gaugeCard: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  gaugeHint: { color: '#667085', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productLocked: { opacity: 0.75 },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconUnlocked: { backgroundColor: colors.primary },
  productInfo: { flex: 1, gap: 2 },
  productTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  productDesc: { color: '#667085', fontSize: 12, lineHeight: 16 },
  productOffer: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 2 },
  productNeed: { color: '#98a2b3', fontSize: 11, fontWeight: '600', marginTop: 2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  delta: { width: 44, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  deltaUp: { backgroundColor: '#e2f6ee' },
  deltaDown: { backgroundColor: '#fdeaea' },
  deltaText: { fontWeight: '800', fontSize: 13 },
  histInfo: { flex: 1, gap: 1 },
  histReason: { color: '#0b1727', fontWeight: '600', fontSize: 13 },
  histDate: { color: '#98a2b3', fontSize: 11 },
  empty: { color: '#98a2b3' },
  // modal
  overlay: { flex: 1, backgroundColor: 'rgba(11,23,39,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
    gap: 8,
  },
  sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e9f0',
    marginBottom: 8,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIconOk: { backgroundColor: colors.accent },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  sheetDetail: { color: '#667085', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  offerBox: {
    alignSelf: 'stretch',
    backgroundColor: '#f3f6fb',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  offerLabel: { color: '#667085', fontSize: 12, fontWeight: '600' },
  offerValue: { color: colors.primary, fontSize: 30, fontWeight: '800' },
  scoreTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e2f6ee',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  scoreTagText: { color: '#067647', fontSize: 11, fontWeight: '700' },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnBusy: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeText: { color: '#98a2b3', fontWeight: '600', marginTop: 12 },
  processing: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  processingText: { fontWeight: '800', color: '#0b1727', fontSize: 16, marginTop: 4 },
  processingSub: { color: '#667085', fontSize: 12 },
  approvedValue: { color: colors.accent, fontSize: 34, fontWeight: '800', marginVertical: 4 },
});
