import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatRp, type BookingStatus } from '@umotor/shared';
import { Card, StatusBadge, colors } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { InboxRow } from '../(tabs)/index';

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const booking = useQuery({
    queryKey: ['booking', id],
    enabled: !!id,
    queryFn: async (): Promise<InboxRow | null> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min), slots(slot_at)',
        )
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as InboxRow;
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
    onError: (e) => Alert.alert('Gagal', e.message),
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('complete_booking', { p_booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      Alert.alert('Servis selesai', 'Pelanggan mendapat +5 MotoScore dan +500 MotoPoints.');
    },
    onError: (e) => Alert.alert('Gagal', e.message),
  });

  const b = booking.data;
  if (!b) {
    return <Text style={styles.loading}>{booking.isLoading ? 'Memuat…' : 'Booking tidak ditemukan.'}</Text>;
  }

  const remaining = Math.max(0, (b.total_amount ?? 0) - b.deposit_amount);
  const busy = transition.isPending || complete.isPending;

  // One primary action per state (PRD 02 §4.3); RPCs enforce the state machine.
  const primary: { label: string; onPress: () => void; color: string } | null =
    b.status === 'pending'
      ? { label: 'Terima booking', color: colors.accent, onPress: () => transition.mutate('confirmed') }
      : b.status === 'confirmed'
        ? { label: 'Check-in (simulasi scan)', color: colors.primary, onPress: () => transition.mutate('checked_in') }
        : b.status === 'checked_in' || b.status === 'in_progress'
          ? {
              label: 'Selesaikan servis',
              color: colors.accent,
              onPress: () =>
                Alert.alert(
                  'Selesaikan servis?',
                  `Sisa tagihan ${formatRp(remaining)} akan ditagih via AstraPay.`,
                  [
                    { text: 'Batal', style: 'cancel' },
                    { text: 'Selesaikan', onPress: () => complete.mutate() },
                  ],
                ),
            }
          : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.row}>
          <Text style={styles.customer}>{b.users?.name ?? '—'}</Text>
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
                : '—'
          }
        />
        <Row label="Deposit" value={`${formatRp(b.deposit_amount)} · Lunas`} />
        <Row label="Total" value={b.total_amount != null ? formatRp(b.total_amount) : '—'} />
        <Row label="Sisa tagihan" value={formatRp(remaining)} />
        <Row label="QR token" value={b.qr_token} />
      </Card>

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
            Alert.alert('Tolak booking?', 'Slot dilepas dan deposit dikembalikan.', [
              { text: 'Batal', style: 'cancel' },
              { text: 'Tolak', style: 'destructive', onPress: () => transition.mutate('cancelled') },
            ])
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
  action: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionBusy: { opacity: 0.6 },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.danger, fontWeight: '700' },
  done: { backgroundColor: '#e2f6ee', borderColor: '#b5e9d4' },
  doneText: { color: '#067647', fontWeight: '600' },
});
