import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, StatusBadge } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { InboxRow } from './index';

export default function Queue() {
  const workshopId = useSession((s) => s.workshopId);

  const queue = useQuery({
    queryKey: ['queue', workshopId],
    enabled: !!workshopId,
    queryFn: async (): Promise<InboxRow[]> => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min), slots(slot_at)',
        )
        .eq('workshop_id', workshopId!)
        .in('status', ['confirmed', 'checked_in', 'in_progress'])
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as InboxRow[];
    },
  });

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={queue.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}>
          <Card>
            <View style={styles.row}>
              <Text style={styles.time}>
                {item.slots
                  ? new Date(item.slots.slot_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Home'}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.customer}>{item.users?.name ?? '—'}</Text>
            <Text style={styles.meta}>
              {item.motorcycles ? `${item.motorcycles.model} · ${item.motorcycles.plate}` : '—'} ·{' '}
              {item.services?.name ?? '—'}
            </Text>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {queue.isLoading ? 'Memuat…' : 'Belum ada antrian hari ini.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  customer: { marginTop: 6, fontSize: 15, fontWeight: '600', color: '#0b1727' },
  meta: { marginTop: 2, color: '#667085', fontSize: 13 },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
