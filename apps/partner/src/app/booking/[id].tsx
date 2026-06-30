import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { formatRp, type BookingStatus } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ErrorState, PrimaryButton, SectionTitle, StatusBadge, astra, colors, useIsWide } from '@/components/ui';
import { confirmDialog, notify } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';
import type { InboxRow } from '../(tabs)/index';

type DetailRow = InboxRow & {
  booking_parts: { qty: number; unit_price: number; spareparts: { name: string } | null }[];
};

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const copyToken = async (token: string) => {
    try {
      // Web clipboard rejects on an insecure (http) context; don't let that
      // become an unhandled rejection that swallows the feedback.
      await Clipboard.setStringAsync(token);
      Haptics.selectionAsync();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('Gagal menyalin', 'Salin token QR secara manual.');
    }
  };

  const booking = useQuery({
    queryKey: ['booking', id],
    enabled: !!id,
    // Status can change from the consumer phone (cancel) — poll as realtime fallback.
    refetchInterval: 10_000,
    queryFn: async (): Promise<DetailRow | null> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min, code), slots(slot_at), booking_parts(qty, unit_price, spareparts(name))',
        )
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as DetailRow;
    },
  });

  // Keep the detail in sync when status changes elsewhere (tabs subscription invalidates ['booking']).
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['booking', id] });
  }, [id, qc]);

  const transition = useMutation({
    mutationFn: async (status: BookingStatus) => {
      const { error } = await supabase.rpc('update_booking_status', {
        p_booking_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => notify('Gagal', e.message),
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_booking', { p_booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      notify('Servis selesai', 'Pelanggan mendapat +5 MotoScore dan +500 MotoPoints.');
    },
    onError: (e) => notify('Gagal', e.message),
  });

  const b = booking.data;
  if (!b) {
    if (booking.isError) return <ErrorState onRetry={() => booking.refetch()} />;
    return <Text style={styles.loading}>{booking.isLoading ? 'Memuat…' : 'Booking tidak ditemukan.'}</Text>;
  }

  const remaining = Math.max(0, (b.total_amount ?? 0) - b.deposit_amount);
  const busy = transition.isPending || complete.isPending;

  const slotValue = b.slots
    ? new Date(b.slots.slot_at).toLocaleString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : b.is_home_service
      ? `Home service — ${b.home_address ?? 'alamat via GPS'}`
      : b.booking_parts.length > 0
        ? 'Pasang sparepart di bengkel'
        : '—';

  // One primary action per state (PRD 02 §4.3); RPCs enforce the state machine.
  const primary: { label: string; onPress: () => void; color: string } | null =
    b.status === 'pending'
      ? { label: 'Terima booking', color: colors.primary, onPress: () => transition.mutate('confirmed') }
      : b.status === 'confirmed'
        ? {
            label: 'Check-in — Scan QR',
            color: colors.primary,
            onPress: () =>
              router.push({ pathname: '/scan', params: { token: b.qr_token } }),
          }
        : b.status === 'checked_in' || b.status === 'in_progress'
          ? {
              label: 'Selesaikan servis',
              color: colors.primary,
              onPress: () =>
                confirmDialog(
                  'Selesaikan servis?',
                  `Sisa tagihan ${formatRp(remaining)} akan ditagih via AstraPay.`,
                  () => complete.mutate(),
                  { confirmLabel: 'Selesaikan' },
                ),
            }
          : null;

  const showFooter = !!primary || b.status === 'pending' || b.status === 'confirmed';

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, wide && styles.contentWide]}
      >
        {/* Document header — receipt-style icon, customer + bike, status badge */}
        <Card style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.docIcon}>
              <Ionicons name="receipt-outline" size={22} color={astra.primary} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.customer} numberOfLines={1}>
                {b.users?.name ?? '—'}
              </Text>
              <Text style={styles.bike} numberOfLines={1}>
                {b.motorcycles
                  ? `${b.motorcycles.brand} ${b.motorcycles.model} · ${b.motorcycles.plate}`
                  : '—'}
              </Text>
            </View>
            <StatusBadge status={b.status} />
          </View>
        </Card>

        {/* Informasi servis — label → value rows */}
        <Card>
          <SectionTitle>Informasi servis</SectionTitle>
          <View style={styles.rows}>
            <Row label="Servis" value={b.services?.name ?? '—'} />
            <Row label="Durasi" value={b.services ? `${b.services.duration_min} menit` : '—'} />
            <Row label={b.is_home_service ? 'Home service' : 'Slot'} value={slotValue} />
            <View style={styles.divider} />
            <Row label="Deposit" value={`${formatRp(b.deposit_amount)} · Lunas`} accentValue />
            <Row label="Total" value={b.total_amount != null ? formatRp(b.total_amount) : '—'} />
            <Row label="Sisa tagihan" value={formatRp(remaining)} bold />
          </View>

          <Pressable
            style={styles.tokenRow}
            onPress={() => copyToken(b.qr_token)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Salin QR token"
          >
            <Text style={styles.detailLabel}>QR token</Text>
            <View style={styles.tokenValue}>
              <Text style={styles.detailValue} numberOfLines={1}>
                {b.qr_token}
              </Text>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={astra.primary}
              />
            </View>
          </Pressable>
          {copied && <Text style={styles.copied}>Token disalin</Text>}
        </Card>

        {/* Rincian biaya — sparepart line items */}
        {b.booking_parts.length > 0 && (
          <Card>
            <SectionTitle>Sparepart dipesan</SectionTitle>
            <View style={styles.rows}>
              {b.booking_parts.map((p, i) => (
                <Row
                  key={`part-${i}`}
                  label={`${p.spareparts?.name ?? 'Sparepart'}${p.qty > 1 ? ` ×${p.qty}` : ''}`}
                  value={formatRp(p.unit_price * p.qty)}
                />
              ))}
            </View>
          </Card>
        )}

        {b.status === 'completed' && (
          <Card style={styles.done}>
            <Ionicons name="checkmark-circle" size={20} color={astra.primary} />
            <Text style={styles.doneText}>Servis selesai — pelanggan mendapat +5 MotoScore.</Text>
          </Card>
        )}
      </ScrollView>

      {showFooter && (
        <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          {primary && (
            <PrimaryButton
              label={primary.label}
              color={primary.color}
              busy={busy}
              onPress={primary.onPress}
            />
          )}
          {(b.status === 'pending' || b.status === 'confirmed') && (
            <Pressable
              style={styles.cancel}
              disabled={busy}
              onPress={() =>
                confirmDialog(
                  'Tolak booking?',
                  'Slot dilepas dan deposit dikembalikan.',
                  () => transition.mutate('cancelled'),
                  { confirmLabel: 'Tolak', destructive: true },
                )
              }
            >
              <Text style={styles.cancelText}>Tolak / batalkan</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  bold,
  accentValue,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accentValue?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, bold && styles.detailLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          bold && styles.detailValueBold,
          accentValue && styles.detailValueAccent,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: astra.bg },
  scroll: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  contentWide: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  loading: { textAlign: 'center', color: astra.faint, marginTop: 48 },

  // Document header card
  headerCard: { paddingVertical: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1, gap: 2 },
  customer: { fontSize: 18, fontWeight: '800', color: astra.ink },
  bike: { color: astra.sub, fontSize: 13 },

  // Label → value rows
  rows: { marginTop: 10 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    gap: 12,
  },
  detailLabel: { color: astra.sub, fontSize: 14 },
  detailLabelBold: { color: astra.ink, fontWeight: '700' },
  detailValue: { color: astra.ink, fontWeight: '600', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  detailValueBold: { fontWeight: '800', color: astra.primary, fontSize: 15 },
  detailValueAccent: { color: colors.accent, fontWeight: '700' },
  divider: { height: 1, backgroundColor: astra.line, marginVertical: 6 },

  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: astra.line,
    gap: 12,
  },
  tokenValue: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  copied: { color: colors.accent, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 4 },

  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: astra.line,
    padding: 16,
    gap: 6,
  },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: colors.danger, fontWeight: '700' },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: astra.tile,
    borderColor: '#bcd8ff',
  },
  doneText: { color: astra.primary, fontWeight: '600', flexShrink: 1 },
});
