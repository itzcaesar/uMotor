import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  COMPONENT_LABELS,
  colors,
  type AppNotification,
  type ComponentHealth,
  type Motorcycle,
} from '@umotor/shared';
import { Card, HealthBar, tabletContainer, useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface BikeWithHealth extends Motorcycle {
  health: ComponentHealth[];
}

export default function Garage() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();

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
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 30_000,
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
      key={r.columns}
      numColumns={r.columns}
      columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[styles.content, tabletContainer(r)]}
      data={bikes.data ?? []}
      keyExtractor={(b) => b.id}
      refreshControl={
        <RefreshControl refreshing={bikes.isRefetching} onRefresh={() => bikes.refetch()} />
      }
      ListHeaderComponent={
        <View style={styles.headerStack}>
          <Pressable style={styles.rideCta} onPress={() => router.push('/ride')}>
            <View style={styles.rideIcon}>
              <Ionicons name="navigate" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rideCtaTitle}>Ride Tracking</Text>
              <Text style={styles.rideCtaSub}>Rekam rute & jarak — odometer terupdate otomatis</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          {banner.data ? (
          <Pressable
            style={styles.banner}
            onPress={() => {
              // The proactive-notification moment (storyline step 3): deep-link into booking.
              const all = bikes.data ?? [];
              const dueBike =
                all.find((b) => b.health.some((h) => h.type === 'oil' && h.pct_used >= 80)) ??
                all[0];
              if (!dueBike) return;
              supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', banner.data!.id)
                .then(() => qc.invalidateQueries({ queryKey: ['maintenance-banner', userId] }));
              router.push({
                pathname: '/booking/new',
                params: { bike: dueBike.id, service: 'oil_change' },
              });
            }}
          >
            <Text style={styles.bannerTitle}>{banner.data.title}</Text>
            <Text style={styles.bannerBody}>{banner.data.body}</Text>
            <Text style={styles.bannerCta}>Lihat bengkel →</Text>
          </Pressable>
          ) : null}
        </View>
      }
      ListFooterComponent={
        <Pressable style={styles.addBike} onPress={() => router.push('/add-bike')}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addBikeText}>Tambah motor (cek Samsat)</Text>
        </Pressable>
      }
      renderItem={({ item }) => {
        const worst = [...item.health].sort((a, b) => b.pct_used - a.pct_used)[0];
        return (
          <Pressable style={styles.cell} onPress={() => router.push({ pathname: '/bike/[id]', params: { id: item.id } })}>
          <Card style={[styles.bikeCard, styles.cellCard]}>
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
          </Pressable>
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
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  headerStack: { gap: 12 },
  rideCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  rideIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideCtaTitle: { fontWeight: '800', color: '#0b1727', fontSize: 15 },
  rideCtaSub: { color: '#667085', fontSize: 12, marginTop: 2 },
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
  addBike: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#cfdcf2',
    borderStyle: 'dashed',
    backgroundColor: '#fff',
  },
  addBikeText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
