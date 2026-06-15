import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { formatRp, type BookingStatus } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ErrorState, StatusBadge, colors, useIsWide } from '@/components/ui';
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

  // One primary action per state (PRD 02 §4.3); RPCs enforce the state machine.
  const primary: { label: string; onPress: () => void; color: string } | null =
    b.status === 'pending'
      ? { label: 'Terima booking', color: colors.accent, onPress: () => transition.mutate('confirmed') }
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
              color: colors.accent,
              onPress: () =>
                confirmDialog(
                  'Selesaikan servis?',
                  `Sisa tagihan ${formatRp(remaining)} akan ditagih via AstraPay.`,
                  () => complete.mutate(),
                  { confirmLabel: 'Selesaikan' },
                ),
            }
          : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }, wide && styles.contentWide]}
    >
      <Card>
        <View style={styles.row}>
          <Text style={styles.customer} numberOfLines={1}>
            {b.users?.name ?? '—'}
          </Text>
          <StatusBadge status={b.status} />
        </View>
        <Text style={styles.bike}>
          {b.motorcycles ? `${b.motorcycles.brand} ${b.motorcycles.model} · ${b.motorcycles.plate}` : '—'}
        </Text>
      </Card>

      <Card>
        <Row label="Servis" value={b.services?.name ?? '—'} />
        <Row label="Durasi" value={b.services ? `${b.services.duration_min} menit` : '—'} />
        <Row
          label="Slot"
          value={
            b.slots
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
                  : '—'
          }
        />
        <Row label="Deposit" value={`${formatRp(b.deposit_amount)} · Lunas`} />
        <Row label="Total" value={b.total_amount != null ? formatRp(b.total_amount) : '—'} />
        <Row label="Sisa tagihan" value={formatRp(remaining)} />
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
              color={copied ? colors.accent : colors.primary}
            />
          </View>
        </Pressable>
        {copied && <Text style={styles.copied}>Token disalin</Text>}
      </Card>

      {b.booking_parts.length > 0 && (
        <Card>
          <Text style={styles.partsTitle}>Sparepart dipesan</Text>
          {b.booking_parts.map((p, i) => (
            <View key={`part-${i}`} style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {p.spareparts?.name ?? 'Sparepart'}
                {p.qty > 1 ? ` ×${p.qty}` : ''}
              </Text>
              <Text style={styles.detailValue}>{formatRp(p.unit_price * p.qty)}</Text>
            </View>
          ))}
        </Card>
      )}

      {primary && (
        <Pressable
          style={[styles.action, { backgroundColor: primary.color }, busy && styles.actionBusy]}
          onPress={primary.onPress}
          disabled={busy}
        >
          <Text style={styles.actionText}>{busy ? '…' : primary.label}</Text>
        </Pressable>
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

      {b.status === 'completed' && (
        <Card style={styles.done}>
          <Text style={styles.doneText}>Servis selesai — pelanggan mendapat +5 MotoScore.</Text>
        </Card>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  bike: { marginTop: 4, color: '#667085' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  detailLabel: { color: '#667085' },
  detailValue: { color: '#0b1727', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  tokenValue: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  copied: { color: colors.accent, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 2 },
  partsTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14, marginBottom: 4 },
  action: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionBusy: { opacity: 0.6 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.danger, fontWeight: '700' },
  done: { backgroundColor: '#e2f6ee', borderColor: '#b5e9d4' },
  doneText: { color: '#067647', fontWeight: '600' },
});
