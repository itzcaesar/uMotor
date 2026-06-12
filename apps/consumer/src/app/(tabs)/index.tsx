import { useQuery } from '@tanstack/react-query';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  COMPONENT_LABELS,
  colors,
  type AppNotification,
  type ComponentHealth,
  type Motorcycle,
} from '@umotor/shared';
import { Card, HealthBar } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface BikeWithHealth extends Motorcycle {
  health: ComponentHealth[];
}

export default function Garage() {
  const userId = useSession((s) => s.userId);

  const bikes = useQuery({
    queryKey: ['garage', userId],
    enabled: !!userId,
    queryFn: async (): Promise<BikeWithHealth[]> => {
      const { data: rows, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at');
      if (error) throw error;
      const ids = (rows ?? []).map((m) => m.id);
      const { data: health, error: hErr } = await supabase
        .from('component_health')
        .select('*')
        .in('motorcycle_id', ids);
      if (hErr) throw hErr;
      return (rows ?? []).map((m) => ({
        ...m,
        health: (health ?? []).filter((h) => h.motorcycle_id === m.id),
      }));
    },
  });

  const banner = useQuery({
    queryKey: ['maintenance-banner', userId],
    enabled: !!userId,
    queryFn: async (): Promise<AppNotification | null> => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .eq('type', 'maintenance')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={bikes.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={bikes.isRefetching} onRefresh={() => bikes.refetch()} />
      }
      ListHeaderComponent={
        banner.data ? (
          <Pressable
            style={styles.banner}
            onPress={() => Alert.alert('Booking servis', 'Alur booking dibangun di milestone M1.')}
          >
            <Text style={styles.bannerTitle}>{banner.data.title}</Text>
            <Text style={styles.bannerBody}>{banner.data.body}</Text>
            <Text style={styles.bannerCta}>Lihat bengkel →</Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => {
        const worst = [...item.health].sort((a, b) => b.pct_used - a.pct_used)[0];
        return (
          <Card style={styles.bikeCard}>
            <View style={styles.bikeHeader}>
              <View>
                <Text style={styles.bikeModel}>
                  {item.brand} {item.model}
                </Text>
                <Text style={styles.bikePlate}>{item.plate}</Text>
              </View>
              <Text style={styles.odo}>{item.odometer_km.toLocaleString('id-ID')} km</Text>
            </View>
            {worst && worst.pct_used >= 80 && (
              <Text style={styles.worst}>
                {COMPONENT_LABELS[worst.type]} — {worst.pct_used}% terpakai
              </Text>
            )}
            {item.health.map((h) => (
              <HealthBar key={h.id} label={COMPONENT_LABELS[h.type]} pctUsed={h.pct_used} />
            ))}
          </Card>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {bikes.isLoading ? 'Memuat garasi…' : bikes.isError ? 'Gagal memuat — tarik untuk coba lagi.' : 'Belum ada motor.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  banner: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  bannerTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  bannerBody: { color: '#dbe7fa', marginTop: 4, fontSize: 13, lineHeight: 18 },
  bannerCta: { color: '#fff', fontWeight: '700', marginTop: 10, fontSize: 14 },
  bikeCard: { gap: 2 },
  bikeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bikeModel: { fontSize: 17, fontWeight: '700', color: '#0b1727' },
  bikePlate: { fontSize: 13, color: '#667085', marginTop: 2 },
  odo: { fontSize: 13, fontWeight: '600', color: '#667085' },
  worst: { marginTop: 8, color: colors.warning, fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
