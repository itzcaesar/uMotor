import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, ErrorState, StatusBadge, colors, useIsWide } from '@/components/ui';
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
      const today = new Date().toDateString();
      const rows = ((data ?? []) as InboxRow[]).filter(
        (b) => b.is_home_service || (b.slots && new Date(b.slots.slot_at).toDateString() === today),
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
          <Pressable
            key={c.key}
            style={[styles.chip, filter === c.key && styles.chipActive]}
            onPress={() => setFilter(c.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === c.key }}
          >
            <Text style={[styles.chipText, filter === c.key && styles.chipTextActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  return (
    <FlatList
      key={wide ? 'wide' : 'narrow'}
      numColumns={wide ? 2 : 1}
      columnWrapperStyle={wide ? styles.columns : undefined}
      style={styles.list}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      data={rows}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl refreshing={queue.isRefetching} onRefresh={() => queue.refetch()} />
      }
      renderItem={({ item }) => {
        const working = item.status === 'checked_in' || item.status === 'in_progress';
        return (
          <Pressable
            style={styles.cell}
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
          >
            <Card style={styles.cellCard}>
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
              {working && (
                <View style={styles.elapsed}>
                  <View style={styles.elapsedDot} />
                  <Text style={styles.elapsedText}>
                    {item.status === 'in_progress' ? 'Dikerjakan' : 'Check-in'} ·{' '}
                    {elapsedLabel(item.updated_at)}
                  </Text>
                </View>
              )}
            </Card>
          </Pressable>
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
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  columns: { gap: 12 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  customer: { marginTop: 6, fontSize: 15, fontWeight: '600', color: '#0b1727' },
  meta: { marginTop: 2, color: '#667085', fontSize: 13 },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e9f0',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#667085', fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  elapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  elapsedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  elapsedText: { color: '#667085', fontSize: 12, fontWeight: '600' },
});
