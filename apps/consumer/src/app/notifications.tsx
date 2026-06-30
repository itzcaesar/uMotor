import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type AppNotification, type ComponentHealth, type Motorcycle } from '@umotor/shared';
import { umotor, useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Notifications() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const notifications = useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', userId] });
    qc.invalidateQueries({ queryKey: ['notif-unread', userId] });
    qc.invalidateQueries({ queryKey: ['maintenance-banner', userId] });
  };

  const markRead = async (n: AppNotification) => {
    if (n.read) return;
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    invalidate();
  };

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId!).eq('read', false);
    invalidate();
  };

  const openMaintenance = async (n: AppNotification) => {
    markRead(n);
    const { data: bikes } = await supabase.from('motorcycles').select('*').eq('user_id', userId!).order('created_at');
    const all = (bikes ?? []) as Motorcycle[];
    if (all.length === 0) return;
    const { data: health } = await supabase
      .from('component_health')
      .select('*')
      .in('motorcycle_id', all.map((b) => b.id));
    const due = (health ?? []).find((h: ComponentHealth) => h.type === 'oil' && h.pct_used >= 80) as ComponentHealth | undefined;
    router.push({ pathname: '/booking/new', params: { bike: due?.motorcycle_id ?? all[0].id, service: 'oil_change' } });
  };

  const unreadCount = (notifications.data ?? []).filter((n) => !n.read).length;

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Ionicons name="notifications" size={26} color={umotor.heroDark} />
        <Text style={styles.headerTitle}>Notification</Text>
        {unreadCount > 0 && (
          <>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable onPress={markAllRead} hitSlop={6}>
              <Text style={styles.markAll}>Tandai dibaca</Text>
            </Pressable>
          </>
        )}
      </View>

      <FlatList
        key={r.columns}
        numColumns={r.columns}
        columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
        contentContainerStyle={[
          { paddingHorizontal: 18, paddingTop: 12, paddingBottom: insets.bottom + 100, gap: 14 },
          r.isTablet && { maxWidth: 760, width: '100%', alignSelf: 'center' },
        ]}
        data={notifications.data ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={() => notifications.refetch()} />}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.cell, !r.isTablet && { width: '100%' }]}
            onPress={() => (item.type === 'maintenance' ? openMaintenance(item) : markRead(item))}
          >
            <View style={[styles.card, item.read ? styles.cardRead : styles.cardUnread]}>
              <View style={styles.cardTop}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {!item.read && <View style={styles.dot} />}
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  {', '}
                  {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
              {item.type === 'maintenance' && <Text style={styles.cta}>Booking servis sekarang →</Text>}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {notifications.isLoading ? 'Memuat…' : notifications.isError ? 'Gagal memuat — tarik untuk coba lagi.' : 'Belum ada notifikasi.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  headerBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e0543f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  markAll: { color: umotor.primary, fontSize: 12, fontWeight: '700' },

  columns: { gap: 14 },
  cell: { flex: 1 },
  card: { borderRadius: 7, paddingHorizontal: 16, paddingVertical: 16, minHeight: 100, justifyContent: 'center', gap: 8 },
  cardUnread: { backgroundColor: '#c3dcff' },
  cardRead: { backgroundColor: '#e6eef9' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.63)', flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: umotor.primary },
  date: { fontSize: 8, color: 'rgba(0,0,0,0.45)', marginLeft: 'auto' },
  body: { fontSize: 10, lineHeight: 14, color: 'rgba(0,0,0,0.45)', fontWeight: '500' },
  cta: { fontSize: 10, fontWeight: '700', color: umotor.primary },
  empty: { textAlign: 'center', color: umotor.faint, marginTop: 48 },
});
