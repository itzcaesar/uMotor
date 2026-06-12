import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, type Workshop } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { supabase } from '@/lib/supabase';

type Filter = 'all' | 'ahass' | 'home';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'ahass', label: 'AHASS' },
  { key: 'home', label: 'Home service' },
];

export default function WorkshopList() {
  const { bike, service } = useLocalSearchParams<{ bike?: string; service?: string }>();
  const setBike = useDraft((s) => s.setBike);
  const setWorkshop = useDraft((s) => s.setWorkshop);
  const [filter, setFilter] = useState<Filter>('all');

  // Entering this screen starts a fresh draft for the chosen bike.
  useEffect(() => {
    if (bike) setBike(bike, service ?? null);
  }, [bike, service, setBike]);

  const workshops = useQuery({
    queryKey: ['workshops'],
    queryFn: async (): Promise<Workshop[]> => {
      // Featured = the 5 seeded with full profiles (distance, prices). Volume rows stay in Console.
      const { data, error } = await supabase
        .from('workshops')
        .select('*')
        .not('distance_km', 'is', null)
        .not('price_estimate_min', 'is', null)
        .order('distance_km')
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Workshop[];
    },
  });

  const list = useMemo(() => {
    const all = workshops.data ?? [];
    if (filter === 'ahass') return all.filter((w) => w.type === 'ahass');
    if (filter === 'home') return all.filter((w) => w.home_service);
    return all;
  }, [workshops.data, filter]);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={list}
      keyExtractor={(w) => w.id}
      ListHeaderComponent={
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, filter === f.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            setWorkshop(item);
            router.push({ pathname: '/booking/workshop/[id]', params: { id: item.id } });
          }}
        >
          <Card style={styles.row}>
            <View style={styles.thumb}>
              <Ionicons name="build" size={24} color={colors.primary} />
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.type === 'ahass' && (
                  <View style={styles.ahass}>
                    <Text style={styles.ahassText}>AHASS</Text>
                  </View>
                )}
              </View>
              <Text style={styles.meta}>
                ★ {Number(item.rating).toFixed(1)} · {item.distance_km} km ·{' '}
                {formatRp(item.price_estimate_min ?? 0)}–{formatRp(item.price_estimate_max ?? 0)}
              </Text>
              <View style={styles.tags}>
                <View style={styles.slotTag}>
                  <Ionicons name="time-outline" size={12} color={colors.accent} />
                  <Text style={styles.slotTagText}>Slot tersedia hari ini</Text>
                </View>
                {item.home_service && (
                  <View style={styles.homeTag}>
                    <Ionicons name="home-outline" size={12} color={colors.primary} />
                    <Text style={styles.homeTagText}>Home service</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#98a2b3" />
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {workshops.isLoading ? 'Memuat bengkel…' : 'Tidak ada bengkel untuk filter ini.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#667085', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: '#0b1727', flexShrink: 1 },
  ahass: { backgroundColor: '#dc2626', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ahassText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 12, color: '#667085' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 2 },
  slotTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  slotTagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  homeTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  homeTagText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
