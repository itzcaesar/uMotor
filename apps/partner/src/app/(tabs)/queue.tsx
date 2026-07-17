import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { statusColor } from '@umotor/shared';
import { Pill, StatusBadge, ErrorState, astra, colors, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
import { jakartaDateKey } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { InboxRow } from './index';

type Filter = 'all' | 'waiting' | 'active';

// Minutes elapsed since the last status change (updated_at). Used to flag jobs
// that have been checked-in / in-progress a while. Proxy: no dedicated timestamp.
function elapsedLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}j ${mins % 60}m`;
}

export default function Queue() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');

  const queue = useQuery({
    queryKey: ['queue', workshopId],
    enabled: !!workshopId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 15_000,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min), slots(slot_at)',
        )
        .eq('workshop_id', workshopId!)
        .in('status', ['confirmed', 'checked_in', 'in_progress'])
        .order('created_at')
        .limit(100);
      if (error) throw error;
      // "Today" means the SLOT date, not when the booking was created.
      // Home-service bookings (no slot) count as today's work.
      const today = jakartaDateKey();
      const rows = ((data ?? []) as InboxRow[]).filter(
        (b) => b.is_home_service || (b.slots && jakartaDateKey(b.slots.slot_at) === today),
      );
      return rows.sort((a, b) => {
        const ta = a.slots ? new Date(a.slots.slot_at).getTime() : 0;
        const tb = b.slots ? new Date(b.slots.slot_at).getTime() : 0;
        return ta - tb;
      });
    },
  });

  const all = queue.data ?? [];
  const counts = useMemo(
    () => ({
      all: all.length,
      waiting: all.filter((b) => b.status === 'confirmed').length,
      active: all.filter((b) => b.status === 'checked_in' || b.status === 'in_progress').length,
    }),
    [all],
  );
  const rows =
    filter === 'all'
      ? all
      : filter === 'waiting'
        ? all.filter((b) => b.status === 'confirmed')
        : all.filter((b) => b.status === 'checked_in' || b.status === 'in_progress');

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: `Semua ${counts.all}` },
    { key: 'waiting', label: `Menunggu ${counts.waiting}` },
    { key: 'active', label: `Dikerjakan ${counts.active}` },
  ];

  const header =
    all.length > 0 ? (
      <View style={styles.chips}>
        {chips.map((c) => (
          <Pill
            key={c.key}
            label={c.label}
            active={filter === c.key}
            onPress={() => setFilter(c.key)}
            style={styles.chip}
          />
        ))}
      </View>
    ) : null;

  return (
    <FlatList
      key={wide ? 'wide' : 'narrow'}
      numColumns={wide ? 2 : 1}
      columnWrapperStyle={wide ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        wide && styles.contentWide,
      ]}
      data={rows}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={
        <>
          <GreetingBar stats />
          {header}
        </>
      }
      refreshControl={
        <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
      }
      renderItem={({ item, index }) => {
        const working = item.status === 'checked_in' || item.status === 'in_progress';
        const inProgress = item.status === 'in_progress';
        const slotTime = item.slots
          ? new Date(item.slots.slot_at).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Home';
        return (
          <FadeInView index={index} style={styles.cell}>
            <PressableScale
              style={styles.cell}
              accessibilityRole="button"
              accessibilityLabel={`Lihat booking ${item.users?.name ?? 'pelanggan'}`}
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
            >
              <View style={styles.card}>
                {/* LEFT — colored slot-time badge */}
                <View style={[styles.badge, { backgroundColor: statusColor[item.status] }]}>
                  <Text style={styles.badgeLabel}>Slot</Text>
                  <Text style={styles.badgeTime} numberOfLines={1}>
                    {slotTime}
                  </Text>
                </View>

                {/* MIDDLE — customer, status, bike/service, elapsed */}
                <View style={styles.body}>
                  <View style={styles.headRow}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {item.users?.name ?? '—'}
                    </Text>
                    <StatusBadge status={item.status} compact />
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.motorcycles ? `${item.motorcycles.model} · ${item.motorcycles.plate}` : '—'} ·{' '}
                    {item.services?.name ?? '—'}
                  </Text>
                  {working && (
                    <View style={styles.elapsed}>
                      <View
                        style={[
                          styles.elapsedDot,
                          { backgroundColor: inProgress ? astra.heroMid : colors.warning },
                        ]}
                      />
                      <Text style={styles.elapsedText}>
                        {inProgress ? 'Dikerjakan' : 'Check-in'} · {elapsedLabel(item.updated_at)}
                      </Text>
                    </View>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={18} color={astra.faint} />
              </View>
            </PressableScale>
          </FadeInView>
        );
      }}
      ListEmptyComponent={
        queue.isError ? (
          <ErrorState onRetry={() => queue.refetch()} />
        ) : (
          <Text style={styles.empty}>
            {queue.isLoading
              ? 'Memuat…'
              : all.length > 0
                ? 'Tidak ada antrian di filter ini.'
                : 'Belum ada antrian hari ini.'}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  columns: { gap: 12 },
  cell: { flex: 1 },

  // Garasi-style light-blue queue card
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eaf1fc',
    borderRadius: 16,
    padding: 12,
  },
  badge: {
    width: 62,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeLabel: { color: '#fff', fontSize: 10, fontWeight: '700', opacity: 0.85 },
  badgeTime: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },

  body: { flex: 1, minWidth: 0, gap: 3 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  customer: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 18, fontWeight: '800', color: astra.ink },
  meta: { color: astra.sub, fontSize: 13 },

  elapsed: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  elapsedDot: { width: 7, height: 7, borderRadius: 4 },
  elapsedText: { color: astra.sub, fontSize: 12, fontWeight: '600' },

  empty: { textAlign: 'center', color: astra.faint, marginTop: 48 },
  chips: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  chip: { flex: 1, alignItems: 'center' },
});
