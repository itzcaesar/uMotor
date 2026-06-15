import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { INSTALL_SERVICE_CODE, formatRp, type Booking, type BookingStatus } from '@umotor/shared';
import { Card, ErrorState, StatusBadge, colors, useIsWide } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type InboxRow = Booking & {
  users: { name: string } | null;
  motorcycles: { plate: string; brand: string; model: string } | null;
  services: { name: string; duration_min: number; code?: string } | null;
  slots: { slot_at: string } | null;
};

export default function Inbox() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  // Quick-accept straight from the card — saves opening the detail to tap Terima.
  const accept = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('update_booking_status', {
        p_booking_id: bookingId,
        p_status: 'confirmed' as BookingStatus,
      });
      if (error) throw error;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => notify('Gagal', (e as Error).message),
  });

  const inbox = useQuery({
    queryKey: ['inbox', workshopId],
    enabled: !!workshopId,
    // Polling fallback: new bookings still land if the realtime channel drops.
    refetchInterval: 15_000,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min, code), slots(slot_at)',
        )
        .eq('workshop_id', workshopId!)
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Sparepart install orders live in their own tab, not the service inbox.
      return ((data ?? []) as InboxRow[]).filter(
        (b) => b.services?.code !== INSTALL_SERVICE_CODE,
      );
    },
  });

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = inbox.data ?? [];
    if (!q) return all;
    return all.filter((b) => {
      const name = b.users?.name?.toLowerCase() ?? '';
      const plate = b.motorcycles?.plate?.toLowerCase() ?? '';
      return name.includes(q) || plate.includes(q);
    });
  }, [inbox.data, q]);

  const searchHeader = (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={16} color="#98a2b3" />
      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama atau plat…"
        placeholderTextColor="#98a2b3"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {search.length > 0 && (
        <Pressable
          onPress={() => setSearch('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Hapus pencarian"
        >
          <Ionicons name="close-circle" size={18} color="#cbd5e1" />
        </Pressable>
      )}
    </View>
  );

  return (
    <FlatList
      key={wide ? 'wide' : 'narrow'}
      numColumns={wide ? 2 : 1}
      columnWrapperStyle={wide ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      data={rows}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={(inbox.data?.length ?? 0) > 0 || q ? searchHeader : null}
      refreshControl={
        <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.cell}
          accessibilityRole="button"
          accessibilityLabel={`Lihat booking ${item.users?.name ?? 'pelanggan'}`}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
        >
          <Card style={styles.cellCard}>
            <View style={styles.row}>
              <Text style={styles.customer}>{item.users?.name ?? '—'}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.bike}>
              {item.motorcycles
                ? `${item.motorcycles.brand} ${item.motorcycles.model} · ${item.motorcycles.plate}`
                : '—'}
            </Text>
            <View style={styles.row}>
              <Text style={styles.service}>
                {item.services?.name ?? '—'}
                {item.services ? ` · ${item.services.duration_min} menit` : ''}
              </Text>
              <Text style={styles.slot}>
                {item.slots
                  ? new Date(item.slots.slot_at).toLocaleString('id-ID', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : item.is_home_service
                    ? 'Home service'
                    : '—'}
              </Text>
            </View>
            <Text style={styles.deposit}>Deposit lunas · {formatRp(item.deposit_amount)}</Text>
            {item.status === 'pending' && (
              <Pressable
                style={[styles.acceptBtn, accept.isPending && styles.acceptBusy]}
                disabled={accept.isPending}
                accessibilityRole="button"
                accessibilityLabel="Terima booking"
                onPress={() => accept.mutate(item.id)}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.acceptText}>Terima</Text>
              </Pressable>
            )}
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        inbox.isError ? (
          <ErrorState onRetry={() => inbox.refetch()} />
        ) : (
          <Text style={styles.empty}>
            {inbox.isLoading
              ? 'Memuat…'
              : q
                ? 'Tidak ada booking yang cocok.'
                : 'Belum ada booking masuk. Booking baru muncul di sini secara real-time.'}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 16, fontWeight: '700', color: '#0b1727' },
  bike: { marginTop: 4, color: '#667085' },
  service: { marginTop: 8, color: '#0b1727', fontWeight: '600' },
  slot: { marginTop: 8, color: '#667085', fontSize: 13 },
  deposit: { marginTop: 8, color: '#00a86b', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48, paddingHorizontal: 24 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e9f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#0b1727', fontSize: 14, padding: 0 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  acceptBusy: { opacity: 0.6 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
