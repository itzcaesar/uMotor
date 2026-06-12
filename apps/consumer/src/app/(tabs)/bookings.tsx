import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { formatRp, type Booking } from '@umotor/shared';
import { Card, StatusBadge } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type BookingRow = Booking & {
  workshops: { name: string } | null;
  services: { name: string } | null;
};

export default function Bookings() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();

  const bookings = useQuery({
    queryKey: ['bookings', userId],
    enabled: !!userId,
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
      style={styles.list}
      contentContainerStyle={styles.content}
      data={bookings.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={bookings.isRefetching} onRefresh={() => bookings.refetch()} />
      }
      renderItem={({ item }) => (
        <Card>
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
        </Card>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {bookings.isLoading ? 'Memuat…' : 'Belum ada booking. Mulai dari banner di Garasi.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workshop: { fontSize: 16, fontWeight: '700', color: '#0b1727' },
  service: { marginTop: 4, color: '#667085' },
  meta: { marginTop: 8, fontSize: 12, color: '#98a2b3' },
  amount: { marginTop: 8, fontWeight: '700', color: '#0b1727' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
