import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type Booking } from '@umotor/shared';
import { StatusBadge, tabletContainer, umotor, useResponsive } from '@/components/ui';
import { FadeInView, PressableScale } from '@/components/motion';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const backIcon = require('../../../assets/figma/ic-back.png');

type BookingRow = Booking & {
  workshops: { name: string } | null;
  services: { name: string } | null;
};

export default function Bookings() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ['bookings', userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <PressableScale onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </PressableScale>
        <Text style={styles.headerTitle}>Riwayat Booking</Text>
      </View>

      <FlatList
        key={r.columns}
        numColumns={r.columns}
        columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, tabletContainer(r), { paddingBottom: insets.bottom + 100 }]}
        data={bookings.data ?? []}
        keyExtractor={(b) => b.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => bookings.refetch()} />}
        renderItem={({ item, index }) => (
          <FadeInView index={index} style={styles.cell}>
            <PressableScale style={styles.cellInner} onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}>
              <View style={styles.card}>
                <View style={styles.iconBox}>
                  <Ionicons name="construct" size={22} color="#fff" />
                </View>
                <View style={styles.mid}>
                  <Text style={styles.workshop} numberOfLines={1}>{item.workshops?.name ?? '—'}</Text>
                  <Text style={styles.service} numberOfLines={1}>{item.services?.name ?? '—'}</Text>
                  <View style={styles.dateRow}>
                    <Ionicons name="time-outline" size={12} color={umotor.faint} />
                    <Text style={styles.meta}>
                      {new Date(item.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <View style={styles.right}>
                  <StatusBadge status={item.status} />
                  <Text style={styles.amount}>{item.total_amount != null ? formatRp(item.total_amount) : '—'}</Text>
                  <View style={styles.openRow}>
                    <Text style={styles.openText}>Lihat detail</Text>
                    <Ionicons name="chevron-forward" size={13} color={umotor.primary} />
                  </View>
                </View>
              </View>
            </PressableScale>
          </FadeInView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  content: { padding: 16, gap: 12 },
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellInner: { flex: 1 },
  card: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    boxShadow: '0px 4px 12px rgba(11,23,39,0.06)',
  },
  iconBox: { width: 46, height: 46, borderRadius: 13, backgroundColor: umotor.heroDark, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, gap: 3, justifyContent: 'center' },
  workshop: { fontSize: 16, fontWeight: '700', color: umotor.heroDark },
  service: { color: umotor.sub, fontSize: 13 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  meta: { fontSize: 12, color: umotor.faint },
  right: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  amount: { fontWeight: '800', color: umotor.heroDark, fontSize: 16 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openText: { fontSize: 12, color: umotor.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: umotor.faint, marginTop: 48 },
});
