import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  colors,
  formatRp,
  type Booking,
  type BookingStatus,
  type Service,
  type Workshop,
} from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type BookingDetail = Booking & {
  workshops: Workshop | null;
  services: Service | null;
  slots: { slot_at: string } | null;
  booking_parts: { qty: number; unit_price: number; spareparts: { name: string } | null }[];
};

const STEPS: { key: BookingStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'pending', label: 'Menunggu', icon: 'hourglass-outline' },
  { key: 'confirmed', label: 'Dikonfirmasi', icon: 'checkmark-circle-outline' },
  { key: 'checked_in', label: 'Check-in', icon: 'qr-code-outline' },
  { key: 'completed', label: 'Selesai', icon: 'trophy-outline' },
];

function stepIndex(status: BookingStatus) {
  if (status === 'in_progress') return 2; // shown as part of the check-in stage
  return Math.max(0, STEPS.findIndex((s) => s.key === status));
}

export default function BookingStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [celebrate, setCelebrate] = useState(false);
  const celebrated = useRef(false);
  const [scoreAnim, setScoreAnim] = useState<{ from: number; to: number; value: number } | null>(null);

  const booking = useQuery({
    queryKey: ['booking-detail', id],
    enabled: !!id,
    queryFn: async (): Promise<BookingDetail> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, workshops(*), services(*), slots(slot_at), booking_parts(qty, unit_price, spareparts(name))',
        )
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as BookingDetail;
    },
  });

  // Realtime on this booking row — the Partner phone drives the status forward.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`booking-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['booking-detail', id] });
          qc.invalidateQueries({ queryKey: ['bookings', userId] });
          // The demo finale: completion celebration, exactly once (PRD 01 §4.7).
          if ((payload.new as Booking).status === 'completed' && !celebrated.current) {
            celebrated.current = true;
            supabase
              .from('motoscore')
              .select('score')
              .eq('user_id', userId!)
              .single()
              .then(({ data }) => {
                const to = data?.score ?? 725;
                setScoreAnim({ from: to - 5, to, value: to - 5 });
                setCelebrate(true);
              });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc, userId]);

  // Count-up animation 720 → 725.
  useEffect(() => {
    if (!celebrate || !scoreAnim) return;
    if (scoreAnim.value >= scoreAnim.to) return;
    const t = setTimeout(() => setScoreAnim((s) => (s ? { ...s, value: s.value + 1 } : s)), 350);
    return () => clearTimeout(t);
  }, [celebrate, scoreAnim]);

  const b = booking.data;
  if (!b) {
    return <Text style={styles.loading}>{booking.isLoading ? 'Memuat…' : 'Booking tidak ditemukan.'}</Text>;
  }

  const idx = stepIndex(b.status);
  const cancelled = b.status === 'cancelled';
  const remaining = Math.max(0, (b.total_amount ?? 0) - b.deposit_amount);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Status stepper */}
        <Card>
          {cancelled ? (
            <View style={styles.cancelled}>
              <Ionicons name="close-circle" size={22} color={colors.danger} />
              <Text style={styles.cancelledText}>Booking dibatalkan — deposit dikembalikan.</Text>
            </View>
          ) : (
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const done = i <= idx;
                return (
                  <View key={s.key} style={styles.step}>
                    <View style={[styles.stepDot, done && styles.stepDotDone]}>
                      <Ionicons name={s.icon} size={16} color={done ? '#fff' : '#98a2b3'} />
                    </View>
                    <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{s.label}</Text>
                    {i < STEPS.length - 1 && (
                      <View style={[styles.stepLine, i < idx && styles.stepLineDone]} />
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {b.status === 'in_progress' && (
            <Text style={styles.inProgress}>Motor sedang dikerjakan mekanik…</Text>
          )}
        </Card>

        {/* QR check-in (until checked in) */}
        {(b.status === 'pending' || b.status === 'confirmed') && (
          <Card style={styles.qrCard}>
            <Text style={styles.qrTitle}>Tunjukkan QR ini saat tiba di bengkel</Text>
            <View style={styles.qrBox}>
              <QRCode value={b.qr_token} size={160} color="#0b1727" />
            </View>
            <Text style={styles.qrToken}>{b.qr_token}</Text>
          </Card>
        )}

        {/* Booking info */}
        <Card>
          <InfoRow label="Bengkel" value={b.workshops?.name ?? '—'} />
          <InfoRow
            label="Jadwal"
            value={
              b.slots
                ? new Date(b.slots.slot_at).toLocaleString('id-ID', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Home service'
            }
          />
          <InfoRow label="Servis" value={b.services?.name ?? '—'} />
          {b.booking_parts.map((p, i) => (
            <InfoRow
              key={i}
              label={`+ ${p.spareparts?.name ?? 'Sparepart'}`}
              value={formatRp(p.unit_price * p.qty)}
            />
          ))}
          <InfoRow label="Deposit" value={`${formatRp(b.deposit_amount)} · lunas`} />
          <InfoRow
            label={b.status === 'completed' ? 'Sisa dibayar' : 'Sisa tagihan'}
            value={formatRp(remaining)}
          />
        </Card>
      </ScrollView>

      {/* Completion celebration overlay */}
      <Modal visible={celebrate} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.celebrateCard}>
            <Ionicons name="trophy" size={44} color="#f5a623" />
            <Text style={styles.celebrateTitle}>Servis selesai!</Text>
            <Text style={styles.celebrateSub}>
              Sisa tagihan {formatRp(remaining)} dibayar via AstraPay.
            </Text>
            <View style={styles.scoreWrap}>
              <Text style={styles.scoreValue}>{scoreAnim?.value ?? '—'}</Text>
              <View style={styles.scoreDelta}>
                <Ionicons name="arrow-up" size={14} color={colors.accent} />
                <Text style={styles.scoreDeltaText}>+5 MotoScore</Text>
              </View>
            </View>
            <View style={styles.pointsTag}>
              <Ionicons name="star" size={14} color="#f5a623" />
              <Text style={styles.pointsText}>+500 MotoPoints</Text>
            </View>
            <Pressable
              style={styles.celebrateBtn}
              onPress={() => {
                setCelebrate(false);
                router.push('/motoscore');
              }}
            >
              <Text style={styles.celebrateBtnText}>Lihat MotoScore</Text>
            </Pressable>
            <Pressable onPress={() => setCelebrate(false)}>
              <Text style={styles.celebrateClose}>Tutup</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', flex: 1, position: 'relative' },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  stepDotDone: { backgroundColor: colors.accent },
  stepLabel: { fontSize: 10, color: '#98a2b3', marginTop: 6, fontWeight: '600' },
  stepLabelDone: { color: '#0b1727' },
  stepLine: {
    position: 'absolute',
    top: 17,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: '#eef1f6',
  },
  stepLineDone: { backgroundColor: colors.accent },
  inProgress: { marginTop: 12, textAlign: 'center', color: colors.primary, fontWeight: '600', fontSize: 13 },
  cancelled: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelledText: { color: colors.danger, fontWeight: '600', flexShrink: 1 },
  qrCard: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  qrTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  qrBox: { padding: 14, backgroundColor: '#fff', borderRadius: 14 },
  qrToken: { color: '#98a2b3', fontSize: 12, letterSpacing: 2, fontFamily: 'monospace' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  infoLabel: { color: '#667085', fontSize: 13 },
  infoValue: { color: '#0b1727', fontWeight: '600', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11,23,39,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  celebrateCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  celebrateTitle: { fontSize: 22, fontWeight: '800', color: '#0b1727' },
  celebrateSub: { color: '#667085', textAlign: 'center', fontSize: 13 },
  scoreWrap: { alignItems: 'center', marginTop: 8 },
  scoreValue: { fontSize: 56, fontWeight: '800', color: colors.accent },
  scoreDelta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreDeltaText: { color: colors.accent, fontWeight: '800' },
  pointsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fdf3e3',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 4,
  },
  pointsText: { color: '#9a6700', fontWeight: '800', fontSize: 13 },
  celebrateBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  celebrateBtnText: { color: '#fff', fontWeight: '700' },
  celebrateClose: { color: '#98a2b3', marginTop: 8, fontWeight: '600' },
});
