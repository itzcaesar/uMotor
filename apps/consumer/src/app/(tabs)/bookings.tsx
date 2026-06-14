import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type Booking } from '@umotor/shared';
import { Card, StatusBadge, tabletContainer, useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type BookingRow = Booking & {
  workshops: { name: string } | null;
  services: { name: string } | null;
};

export default function Bookings() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();

  const bookings = useQuery({
    queryKey: ['bookings', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 20_000,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, workshops(name), services(name)')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BookingRow[];
    },
  });

  // Status changes from the Partner phone arrive live (architecture doc §7).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('consumer-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['bookings', userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return (
    <FlatList
      key={r.columns}
      numColumns={r.columns}
      columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[styles.content, tabletContainer(r)]}
      data={bookings.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={bookings.isRefetching} onRefresh={() => bookings.refetch()} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.cell}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
        >
          <Card style={styles.cellCard}>
            <View style={styles.row}>
              <Text style={styles.workshop}>{item.workshops?.name ?? '—'}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.service}>{item.services?.name ?? '—'}</Text>
            <View style={styles.row}>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.amount}>
                {item.total_amount != null ? formatRp(item.total_amount) : '—'}
              </Text>
            </View>
            <View style={styles.openRow}>
              <Text style={styles.openText}>
                {item.status === 'pending' || item.status === 'confirmed'
                  ? 'Lihat status & QR check-in'
                  : 'Lihat detail'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#98a2b3" />
            </View>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {bookings.isLoading
            ? 'Memuat…'
            : bookings.isError
              ? 'Gagal memuat — tarik untuk coba lagi.'
              : 'Belum ada booking. Mulai dari banner di Garasi.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workshop: { fontSize: 16, fontWeight: '700', color: '#0b1727' },
  service: { marginTop: 4, color: '#667085' },
  meta: { marginTop: 8, fontSize: 12, color: '#98a2b3' },
  amount: { marginTop: 8, fontWeight: '700', color: '#0b1727' },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  openText: { fontSize: 12, color: '#98a2b3', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
