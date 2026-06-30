import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { formatRp, type MotoScore } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { umotor, useResponsive } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const backIcon = require('../../assets/figma/ic-back.png');

interface HistoryRow {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
}

type Kind = 'loan' | 'insurance' | 'installment';

const PROD_ICON: Record<Kind, number> = {
  loan: require('../../assets/figma/ic-dollarbag.png'),
  insurance: require('../../assets/figma/ic-protect.png'),
  installment: require('../../assets/figma/ic-card.png'),
};
const timeMachineIcon = require('../../assets/figma/ic-timemachine.png');

const PRODUCTS: {
  kind: Kind;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  min: number;
}[] = [
  { kind: 'loan', icon: 'flash', title: 'Pinjaman darurat', desc: 'Cair dalam 5 menit untuk servis mendadak', min: 650 },
  { kind: 'insurance', icon: 'shield-checkmark', title: 'Asuransi motor', desc: 'Premi dipersonalisasi dari pola perawatan motor', min: 600 },
  { kind: 'installment', icon: 'card', title: 'Cicilan sparepart 0%', desc: 'Beli sparepart, bayar bertahap tanpa bunga', min: 700 },
];

// Instant underwriting from the MotoScore — the proposal's core innovation:
// maintenance behaviour, not bank credit history, sets the offer.
function buildOffer(kind: Kind, score: number) {
  const round = (n: number, step: number) => Math.round(n / step) * step;
  if (kind === 'loan') {
    const amount = Math.min(5_000_000, Math.max(500_000, round((score - 600) * 20_000, 50_000)));
    return { amount, headline: formatRp(amount), unit: 'Limit pinjaman disetujui!', detail: 'Tenor 3–12 bulan · bunga rendah · cair instan ke AstraPay', action: 'Cairkan ke AstraPay' };
  }
  if (kind === 'insurance') {
    const premium = Math.max(120_000, round(350_000 - (score - 600) * 600, 10_000));
    return { amount: premium, headline: `${formatRp(premium)}/th`, unit: 'Estimasi premi tahunan', detail: 'TLO + santunan kecelakaan · premi turun saat skormu naik', action: 'Aktifkan asuransi' };
  }
  const limit = Math.min(10_000_000, Math.max(1_000_000, round((score - 650) * 15_000, 100_000)));
  return { amount: limit, headline: formatRp(limit), unit: 'Limit cicilan 0%', detail: 'Beli sparepart sekarang, bayar 3–6× tanpa bunga', action: 'Aktifkan limit' };
}

// ── Half-circle score gauge (Figma 82:282) ─────────────────────────────────
function polar(cx: number, cy: number, rad: number, deg: number) {
  const a = ((deg - 180) * Math.PI) / 180;
  return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
}
function arcPath(cx: number, cy: number, rad: number, from: number, to: number) {
  const s = polar(cx, cy, rad, from);
  const e = polar(cx, cy, rad, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${rad} ${rad} 0 ${large} 1 ${e.x} ${e.y}`;
}
function bandLabel(score: number) {
  if (score < 580) return 'Kurang';
  if (score < 670) return 'Cukup';
  if (score < 740) return 'Baik';
  return 'Sangat Baik';
}
function Gauge({ score, w, px }: { score: number; w: number; px: (n: number) => number }) {
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const sw = px(22);
  const pad = sw / 2 + px(2);
  const rad = (w - pad * 2) / 2;
  const cx = w / 2;
  const cy = pad + rad;
  const h = cy + sw / 2 + px(2);
  return (
    <View style={{ width: w, alignItems: 'center' }}>
      <Svg width={w} height={h}>
        <Path d={arcPath(cx, cy, rad, 0, 180)} stroke="#b9cde8" strokeWidth={sw} fill="none" strokeLinecap="round" />
        {pct > 0.01 && (
          <Path d={arcPath(cx, cy, rad, 0, pct * 180)} stroke="#558fde" strokeWidth={sw} fill="none" strokeLinecap="round" />
        )}
      </Svg>
      <View style={{ position: 'absolute', top: cy - px(86), left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ fontSize: px(76), lineHeight: px(86), fontWeight: '800', color: umotor.heroDark }}>{score}</Text>
        <Text style={{ fontSize: px(24), fontWeight: '700', color: umotor.heroDark, marginTop: px(-2) }}>{bandLabel(score)}</Text>
      </View>
    </View>
  );
}

export default function MotoScoreScreen() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<(typeof PRODUCTS)[number] | null>(null);
  const [stage, setStage] = useState<'review' | 'processing' | 'approved'>('review');
  const [finalizing, setFinalizing] = useState(false);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const contentW = Math.min(r.width, 460);
  const s = contentW / 402;
  const px = (n: number) => n * s;

  const data = useQuery({
    queryKey: ['motoscore', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 30_000,
    queryFn: async () => {
      const [score, history] = await Promise.all([
        supabase.from('motoscore').select('*').eq('user_id', userId!).single(),
        supabase.from('motoscore_history').select('*').eq('user_id', userId!).order('created_at', { ascending: false }).limit(10),
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoscore', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ['motoscore', userId] }),
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
        const { data: u } = await supabase.from('users').select('astrapay_balance').eq('id', userId).single();
        if (u) {
          await supabase.from('users').update({ astrapay_balance: u.astrapay_balance + offer.amount }).eq('id', userId);
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
      notify('Berhasil', msg);
    } catch (e) {
      notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Moto Score</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: contentW }}>
          {/* gauge */}
          <View style={{ alignItems: 'center', marginTop: px(8) }}>
            <Gauge score={score} w={px(330)} px={px} />
          </View>
          <Text style={[styles.hint, { marginTop: px(10), paddingHorizontal: px(34) }]}>
            Dihitung dari ketepatan servis, pembayaran tagihan, dan kondisi motormu! Bukan riwayat kredit bank.
          </Text>

          {/* products — navy panel */}
          <View style={[styles.panel, { marginTop: px(18), marginHorizontal: px(14), borderRadius: px(22), padding: px(14), gap: px(12) }]}>
            {PRODUCTS.map((p) => {
              const unlocked = score >= p.min;
              const po = unlocked ? buildOffer(p.kind, score) : null;
              return (
                <Pressable
                  key={p.title}
                  disabled={!unlocked}
                  onPress={() => openOffer(p)}
                  style={[styles.product, { borderRadius: px(16), padding: px(13), gap: px(11) }, !unlocked && { opacity: 0.55 }]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !unlocked }}
                >
                  <View style={[styles.prodIcon, { width: px(46), height: px(46), borderRadius: px(13) }]}>
                    <Image source={PROD_ICON[p.kind]} style={{ width: px(24), height: px(24) }} contentFit="contain" tintColor={umotor.heroDark} />
                  </View>
                  <View style={{ flex: 1, gap: px(2) }}>
                    <Text style={[styles.prodTitle, { fontSize: px(14) }]}>{p.title}</Text>
                    <Text style={[styles.prodDesc, { fontSize: px(11), lineHeight: px(15) }]}>{p.desc}</Text>
                    {po ? (
                      <Text style={{ marginTop: px(2) }}>
                        <Text style={[styles.prodOffer, { fontSize: px(14) }]}>{po.headline} </Text>
                        <Text style={[styles.prodUnit, { fontSize: px(9) }]}>{po.unit}</Text>
                      </Text>
                    ) : (
                      <Text style={[styles.prodUnit, { fontSize: px(10), marginTop: px(2) }]}>Butuh skor {p.min}+ untuk membuka</Text>
                    )}
                  </View>
                  <View style={[styles.chevDot, { width: px(30), height: px(30), borderRadius: px(15) }]}>
                    <Ionicons name={unlocked ? 'chevron-forward' : 'lock-closed'} size={px(15)} color="#fff" />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* history */}
          <View style={{ paddingHorizontal: px(18), marginTop: px(16) }}>
            <Text style={[styles.histTitle, { fontSize: px(15), marginBottom: px(4) }]}>Riwayat Skor</Text>
            {(data.data?.history ?? []).map((h) => (
              <View key={h.id} style={[styles.histRow, { paddingVertical: px(11) }]}>
                <Image source={timeMachineIcon} style={{ width: px(26), height: px(26) }} contentFit="contain" tintColor={umotor.heroDark} />
                <View style={{ flex: 1, gap: px(1) }}>
                  <Text style={[styles.histReason, { fontSize: px(13) }]}>{h.reason}</Text>
                  <Text style={[styles.histDate, { fontSize: px(11) }]}>
                    {new Date(h.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}, {new Date(h.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={[styles.delta, { borderRadius: px(8) }, h.delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
                  <Text style={[styles.deltaText, { fontSize: px(13), color: h.delta >= 0 ? '#00a86b' : '#e0543f' }]}>
                    {h.delta >= 0 ? `+${h.delta}` : h.delta}
                  </Text>
                </View>
              </View>
            ))}
            {data.data?.history.length === 0 && <Text style={styles.empty}>Belum ada riwayat.</Text>}
          </View>
        </View>
      </ScrollView>

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
                        <Ionicons name="trending-up" size={13} color={'#00a86b'} />
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
                    <ActivityIndicator size="large" color={umotor.primary} />
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
                    <Pressable style={[styles.primaryBtn, finalizing && styles.btnBusy]} onPress={finalize} disabled={finalizing}>
                      {finalizing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{offer.action}</Text>}
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 6 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  range: { fontSize: 12, fontWeight: '600', color: umotor.faint },
  hint: { color: umotor.sub, fontSize: 12, textAlign: 'center', lineHeight: 17 },

  panel: { backgroundColor: umotor.heroDark },
  product: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  prodIcon: { backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  prodTitle: { fontWeight: '700', color: umotor.heroDark },
  prodDesc: { color: umotor.sub },
  prodOffer: { color: umotor.heroDark, fontWeight: '800' },
  prodUnit: { color: umotor.faint, fontWeight: '500' },
  chevDot: { backgroundColor: '#2b6fd0', alignItems: 'center', justifyContent: 'center' },

  histTitle: { fontWeight: '800', color: umotor.heroDark },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: umotor.line },
  histReason: { color: umotor.ink, fontWeight: '600' },
  histDate: { color: umotor.faint },
  delta: { width: 44, paddingVertical: 4, alignItems: 'center' },
  deltaUp: { backgroundColor: '#e2f6ee' },
  deltaDown: { backgroundColor: '#fdeaea' },
  deltaText: { fontWeight: '800' },
  empty: { color: umotor.faint, marginTop: 8 },

  // modal
  overlay: { flex: 1, backgroundColor: 'rgba(11,23,39,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, alignItems: 'center', gap: 8 },
  sheetWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e9f0', marginBottom: 8 },
  sheetIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: umotor.primary, alignItems: 'center', justifyContent: 'center' },
  sheetIconOk: { backgroundColor: '#00a86b' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: umotor.ink, marginTop: 4 },
  sheetDetail: { color: umotor.sub, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  offerBox: { alignSelf: 'stretch', backgroundColor: umotor.bg, borderRadius: 16, padding: 18, alignItems: 'center', gap: 4, marginTop: 8 },
  offerLabel: { color: umotor.sub, fontSize: 12, fontWeight: '600' },
  offerValue: { color: umotor.primary, fontSize: 30, fontWeight: '800' },
  scoreTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e2f6ee', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  scoreTagText: { color: '#067647', fontSize: 11, fontWeight: '700' },
  primaryBtn: { alignSelf: 'stretch', backgroundColor: umotor.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  btnBusy: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeText: { color: umotor.faint, fontWeight: '600', marginTop: 12 },
  processing: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  processingText: { fontWeight: '800', color: umotor.ink, fontSize: 16, marginTop: 4 },
  processingSub: { color: umotor.sub, fontSize: 12 },
  approvedValue: { color: '#00a86b', fontSize: 34, fontWeight: '800', marginVertical: 4 },
});
