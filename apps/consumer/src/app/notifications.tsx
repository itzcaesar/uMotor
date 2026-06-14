import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, type AppNotification, type ComponentHealth, type Motorcycle } from '@umotor/shared';
import { tabletContainer, useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  maintenance: 'build',
  score: 'trending-up',
};

export default function Notifications() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();

  const notifications = useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
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
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId!)
      .eq('read', false);
    invalidate();
  };

  // Maintenance notifications deep-link into booking, same as the Garasi banner.
  const openMaintenance = async (n: AppNotification) => {
    markRead(n);
    const { data: bikes } = await supabase
      .from('motorcycles')
      .select('*')
      .eq('user_id', userId!)
      .order('created_at');
    const all = (bikes ?? []) as Motorcycle[];
    if (all.length === 0) return;
    const { data: health } = await supabase
      .from('component_health')
      .select('*')
      .in('motorcycle_id', all.map((b) => b.id));
    const due = (health ?? []).find(
      (h: ComponentHealth) => h.type === 'oil' && h.pct_used >= 80,
    ) as ComponentHealth | undefined;
    const bikeId = due?.motorcycle_id ?? all[0].id;
    router.push({ pathname: '/booking/new', params: { bike: bikeId, service: 'oil_change' } });
  };

  const unreadCount = (notifications.data ?? []).filter((n) => !n.read).length;

  return (
    <FlatList
      key={r.columns}
      numColumns={r.columns}
      columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[styles.content, tabletContainer(r)]}
      data={notifications.data ?? []}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl
          refreshing={notifications.isRefetching}
          onRefresh={() => notifications.refetch()}
        />
      }
      ListHeaderComponent={
        unreadCount > 0 ? (
          <View style={styles.headerRow}>
            <Text style={styles.unreadInfo}>{unreadCount} belum dibaca</Text>
            <Pressable onPress={markAllRead} hitSlop={6}>
              <Text style={styles.markAll}>Tandai semua dibaca</Text>
            </Pressable>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.cell}
          onPress={() => (item.type === 'maintenance' ? openMaintenance(item) : markRead(item))}
        >
          <View style={[styles.card, styles.cellCard, !item.read && styles.cardUnread]}>
            <View style={[styles.icon, !item.read && styles.iconUnread]}>
              <Ionicons
                name={TYPE_ICONS[item.type] ?? 'notifications'}
                size={18}
                color={item.read ? '#98a2b3' : colors.primary}
              />
            </View>
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.read && <View style={styles.dot} />}
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {item.type === 'maintenance' && (
                  <Text style={styles.cta}>Booking servis →</Text>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {notifications.isLoading
            ? 'Memuat…'
            : notifications.isError
              ? 'Gagal memuat — tarik untuk coba lagi.'
              : 'Belum ada notifikasi.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 10 },
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  unreadInfo: { color: '#667085', fontSize: 13, fontWeight: '600' },
  markAll: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  cardUnread: { backgroundColor: '#f5f9ff', borderColor: '#cfdcf2' },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f3f6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: '#eef4fd' },
  info: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '600', color: '#475467', fontSize: 14, flexShrink: 1 },
  titleUnread: { fontWeight: '800', color: '#0b1727' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  body: { color: '#667085', fontSize: 12, lineHeight: 17 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  date: { color: '#98a2b3', fontSize: 11 },
  cta: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
