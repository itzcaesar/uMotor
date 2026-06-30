import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type Workshop } from '@umotor/shared';
import { WorkshopMap } from '@/components/WorkshopMap';
import { umotor, useResponsive } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

const garageIcon = require('../../assets/figma/ic-garage.png');
const backIcon = require('../../assets/figma/ic-back.png');

type Filter = 'all' | 'ahass' | 'home';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'ahass', label: 'AHASS' },
  { key: 'home', label: 'Home Services' },
];

export default function BengkelMap() {
  const setWorkshop = useDraft((s) => s.setWorkshop);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const workshops = useQuery({
    queryKey: ['workshops-map'],
    queryFn: async (): Promise<Workshop[]> => {
      const { data, error } = await supabase
        .from('workshops')
        .select('*')
        .not('lat', 'is', null)
        .not('distance_km', 'is', null)
        .order('distance_km')
        .limit(30);
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

  const open = (item: Workshop) => {
    setWorkshop(item);
    router.push({ pathname: '/booking/workshop/[id]', params: { id: item.id } });
  };

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Bengkel Terdekat</Text>
      </View>

      {/* Interactive map pinned above the list — keeping it out of the vertical
          ScrollView lets pan/zoom gestures stay with the map instead of fighting
          the list scroll (and on web the iframe gets the pointer cleanly). */}
      <View style={[styles.mapWrap, r.isTablet && { maxWidth: 760, width: '100%', alignSelf: 'center' }]}>
        <WorkshopMap workshops={list} selectedId={selected} onSelect={setSelected} height={r.isTablet ? 320 : 240} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.body, r.isTablet && { maxWidth: 760, width: '100%', alignSelf: 'center' }]}>
          {/* filter chips */}
          <View style={styles.chips}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                  <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {list.map((item) => {
            const isSel = selected === item.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.card, isSel && styles.cardSel]}
                onPress={() => setSelected(item.id)}
                onLongPress={() => open(item)}
              >
                <View style={styles.navyBox}>
                  <Image source={garageIcon} style={{ width: 40, height: 40 }} contentFit="contain" tintColor="#fff" />
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Ionicons name="star" size={11} color="#f5a623" />
                    <Text style={styles.rating}>{Number(item.rating).toFixed(1)}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    {item.type === 'ahass' ? (
                      <View style={styles.pill}><Text style={styles.pillText}>AHASS</Text></View>
                    ) : item.home_service ? (
                      <View style={styles.pill}><Text style={styles.pillText}>Home Services</Text></View>
                    ) : null}
                    <Text style={styles.meta}>{item.distance_km} km</Text>
                    <Text style={styles.meta}>{formatRp(item.price_estimate_min ?? 0)} - {formatRp(item.price_estimate_max ?? 0)}</Text>
                  </View>
                </View>
                <Pressable style={styles.bookPill} onPress={() => open(item)}>
                  <Text style={styles.bookText}>Booking</Text>
                  <View style={styles.bookArrow}><Ionicons name="chevron-forward" size={9} color={umotor.heroDark} /></View>
                </Pressable>
              </Pressable>
            );
          })}

          {list.length === 0 && (
            <Text style={styles.empty}>{workshops.isLoading ? 'Memuat bengkel…' : 'Tidak ada bengkel untuk filter ini.'}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  body: { paddingHorizontal: 17, gap: 12 },
  mapWrap: { paddingHorizontal: 17, paddingTop: 4, paddingBottom: 12 },

  chips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  chip: { height: 28, borderRadius: 30, paddingHorizontal: 16, justifyContent: 'center' },
  chipActive: { backgroundColor: umotor.heroDark },
  chipIdle: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e2f0' },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipTextIdle: { color: 'rgba(28,78,147,0.67)' },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', minHeight: 78, alignItems: 'center', overflow: 'hidden' },
  cardSel: { borderColor: umotor.primary, borderWidth: 1.5 },
  navyBox: { width: 70, alignSelf: 'stretch', backgroundColor: umotor.heroDark, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 16, fontWeight: '500', color: '#000', flexShrink: 1 },
  rating: { fontSize: 10, fontWeight: '700', color: 'rgba(0,0,0,0.45)' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: { backgroundColor: '#c5dbf9', borderRadius: 15, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { color: umotor.heroDark, fontSize: 7, fontWeight: '600' },
  meta: { fontSize: 8, fontWeight: '500', color: 'rgba(0,0,0,0.4)' },

  bookPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2b6fd0', borderRadius: 999, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, marginRight: 10 },
  bookText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  bookArrow: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  empty: { textAlign: 'center', color: umotor.sub, marginTop: 40 },
});
