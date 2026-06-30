import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { INSTALL_SERVICE_CODE } from '@umotor/shared';
import { astra } from './ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ACTIVE = ['confirmed', 'checked_in', 'in_progress'];

/**
 * Shared floating top bar for the tab screens (the tab headers are hidden).
 * Greeting + workshop name (identity), LIVE pill, settings shortcut, and — on
 * sub-pages (`stats`) — an at-a-glance strip: new inbox / active queue / sparepart orders.
 */
export function GreetingBar({
  greeting = 'Halo, Mitra 👋',
  stats = false,
}: {
  greeting?: string;
  stats?: boolean;
}) {
  const workshopId = useSession((s) => s.workshopId);

  const head = useQuery({
    queryKey: ['workshop-head', workshopId],
    enabled: !!workshopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshops')
        .select('name')
        .eq('id', workshopId!)
        .single();
      if (error) throw error;
      return data as { name: string };
    },
  });

  const counts = useQuery({
    queryKey: ['head-stats', workshopId],
    enabled: !!workshopId && stats,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('status, services(code)')
        .eq('workshop_id', workshopId!)
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { status: string; services: { code: string } | null }[];
      return {
        pending: rows.filter((r) => r.status === 'pending').length,
        active: rows.filter((r) => ACTIVE.includes(r.status)).length,
        orders: rows.filter(
          (r) => r.services?.code === INSTALL_SERVICE_CODE && r.status !== 'cancelled',
        ).length,
      };
    },
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <View style={styles.text}>
          <Text style={styles.greet}>{greeting}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {head.data?.name ?? 'Memuat…'}
          </Text>
        </View>
        <View style={styles.actions}>
          <View style={styles.livePill}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Pressable
            style={styles.avatar}
            onPress={() => router.push('/profile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Kelola bengkel"
          >
            <Ionicons name="settings-outline" size={20} color={astra.primary} />
          </Pressable>
        </View>
      </View>

      {stats && (
        <View style={styles.stats}>
          <StatCol value={counts.data?.pending} label="Inbox baru" />
          <View style={styles.statDivider} />
          <StatCol value={counts.data?.active} label="Antrian" />
          <View style={styles.statDivider} />
          <StatCol value={counts.data?.orders} label="Sparepart" />
        </View>
      )}
    </View>
  );
}

function StatCol({ value, label }: { value?: number; label: string }) {
  return (
    <View style={styles.statCol}>
      <Text style={styles.statVal}>{value ?? '—'}</Text>
      <Text style={styles.statLab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  text: { flexShrink: 1 },
  greet: { color: astra.sub, fontSize: 14, fontWeight: '600' },
  name: { color: astra.ink, fontSize: 22, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: astra.tile,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: astra.primary },
  liveText: { color: astra.primary, fontWeight: '800', fontSize: 11 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: astra.line,
    shadowColor: '#0b1727',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  stats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: astra.line,
    paddingVertical: 12,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 1 },
  statVal: { color: astra.primary, fontSize: 20, fontWeight: '800' },
  statLab: { color: astra.sub, fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: astra.line, marginVertical: 4 },
});
