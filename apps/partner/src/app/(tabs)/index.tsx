import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Booking } from '@umotor/shared';
import { Card, StatusBadge } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type InboxRow = Booking & {
  users: { name: string } | null;
  motorcycles: { plate: string; brand: string; model: string } | null;
  services: { name: string; duration_min: number } | null;
  slots: { slot_at: string } | null;
};

export default function Inbox() {
  const workshopId = useSession((s) => s.workshopId);

  const inbox = useQuery({
    queryKey: ['inbox', workshopId],
    enabled: !!workshopId,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min), slots(slot_at)',
        )
        .eq('workshop_id', workshopId!)
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as InboxRow[];
    },
  });

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={inbox.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}>
          <Card>
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
            <Text style={styles.deposit}>Deposit lunas · Rp 25.000</Text>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {inbox.isLoading
            ? 'Memuat…'
            : 'Belum ada booking masuk. Booking baru muncul di sini secara real-time.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 16, fontWeight: '700', color: '#0b1727' },
  bike: { marginTop: 4, color: '#667085' },
  service: { marginTop: 8, color: '#0b1727', fontWeight: '600' },
  slot: { marginTop: 8, color: '#667085', fontSize: 13 },
  deposit: { marginTop: 8, color: '#00a86b', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48, paddingHorizontal: 24 },
});
