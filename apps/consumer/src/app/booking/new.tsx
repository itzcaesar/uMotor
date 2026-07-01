import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type Workshop } from '@umotor/shared';
import { Illustration } from '@/components/Illustration';
import { umotor, useResponsive } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

const garageIcon = require('../../../assets/figma/ic-garage.png');
const backIcon = require('../../../assets/figma/ic-back.png');

type Filter = 'all' | 'ahass' | 'home';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'ahass', label: 'AHASS' },
  { key: 'home', label: 'Home Services' },
];

export default function WorkshopList() {
  const { bike, service } = useLocalSearchParams<{ bike?: string; service?: string }>();
  const setBike = useDraft((s) => s.setBike);
  const setWorkshop = useDraft((s) => s.setWorkshop);
  const [filter, setFilter] = useState<Filter>('all');
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  // On web `useWindowDimensions` is the full browser window, so a width-relative
  // hero scales wildly (huge on desktop, a bare peak on a narrow viewport). Clamp
  // it to a phone-like band and center it so the mountain always reads as the same
  // flat ridge backdrop — it sits within the 150px art window above the sheet.
  const heroW = Math.min(Math.max(r.width, 380), 460);

  useEffect(() => {
    if (bike) setBike(bike, service ?? null);
  }, [bike, service, setBike]);

  const workshops = useQuery({
    queryKey: ['workshops'],
    queryFn: async (): Promise<Workshop[]> => {
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
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Pilih Bengkel</Text>
      </View>

      {/* decorative scene: light mountain + flanking trees + biker */}
      <View style={styles.art} pointerEvents="none">
        <View style={[styles.artScene, { width: heroW }]}>
          <View style={{ position: 'absolute', left: -20, right: -20, bottom: -64 }}>
            <Illustration name="mountainBengkel" width={heroW + 40} />
          </View>
          <View style={{ position: 'absolute', left: -56, bottom: -8 }}>
            <Illustration name="treeBengkel" width={150} />
          </View>
          <View style={{ position: 'absolute', right: -56, bottom: -8, transform: [{ scaleX: -1 }] }}>
            <Illustration name="treeBengkel" width={150} />
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 4, alignItems: 'center' }}>
            <Illustration name="biker" width={132} />
          </View>
        </View>
      </View>

      {/* Fixed blue sheet — only the card list inside scrolls, so the filter
          chips stay pinned at the top of the sheet while you scroll. */}
      <View style={[styles.panel, r.isTablet && { maxWidth: 760, width: '100%', alignSelf: 'center' }]}>
        {/* filter chips — pinned above the scrolling list */}
        <View style={styles.chipsRow}>
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
          <Ionicons name="options-outline" size={18} color={umotor.heroDark} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }} showsVerticalScrollIndicator={false}>
          {list.map((item) => (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => {
                setWorkshop(item);
                router.push({ pathname: '/booking/workshop/[id]', params: { id: item.id } });
              }}
            >
              <View style={styles.navyBox}>
                <Image source={garageIcon} style={{ width: 44, height: 44 }} contentFit="contain" tintColor="#fff" />
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Ionicons name="star" size={11} color="rgba(0,0,0,0.35)" />
                  <Text style={styles.rating}>{Number(item.rating).toFixed(1)}</Text>
                </View>
                <View style={styles.metaRow}>
                  {item.type === 'ahass' && (
                    <View style={styles.ahassPill}><Text style={styles.ahassText}>AHASS</Text></View>
                  )}
                  {item.type !== 'ahass' && item.home_service && (
                    <View style={styles.ahassPill}><Text style={styles.ahassText}>Home Services</Text></View>
                  )}
                  <Text style={styles.meta}>{item.distance_km} km</Text>
                  <Text style={styles.meta}>{formatRp(item.price_estimate_min ?? 0)} - {formatRp(item.price_estimate_max ?? 0)}</Text>
                </View>
                <View style={styles.slotRow}>
                  <Ionicons name="time-outline" size={11} color="#00a86b" />
                  <Text style={styles.slotText}>Slot tersedia hari ini, Booking sekarang!</Text>
                </View>
              </View>

              {/* Booking pill bottom-right */}
              <View style={styles.bookPill}>
                <Text style={styles.bookText}>Booking</Text>
                <View style={styles.bookArrow}>
                  <Ionicons name="chevron-forward" size={9} color={umotor.heroDark} />
                </View>
              </View>
            </Pressable>
          ))}

          {list.length === 0 && (
            <Text style={styles.empty}>{workshops.isLoading ? 'Memuat bengkel…' : 'Tidak ada bengkel untuk filter ini.'}</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 6 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  art: { height: 150, overflow: 'hidden' },
  artScene: { height: 150, alignSelf: 'center', position: 'relative' },

  panel: { flex: 1, backgroundColor: '#d3e6ff', borderTopLeftRadius: 21, borderTopRightRadius: 21, borderWidth: 0.5, borderColor: umotor.heroDark, paddingHorizontal: 17, paddingTop: 16, gap: 12 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', gap: 10, flex: 1, flexWrap: 'wrap' },
  chip: { height: 26, borderRadius: 30, paddingHorizontal: 14, justifyContent: 'center' },
  chipActive: { backgroundColor: umotor.heroDark },
  chipIdle: { backgroundColor: '#fff' },
  chipText: { fontSize: 10, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipTextIdle: { color: 'rgba(28,78,147,0.67)' },

  card: { flexDirection: 'row', backgroundColor: '#f6faff', borderRadius: 18, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)', minHeight: 82, alignItems: 'stretch', overflow: 'hidden' },
  navyBox: { width: 86, backgroundColor: umotor.heroDark, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 18, fontWeight: '500', color: '#000', flexShrink: 1 },
  rating: { fontSize: 10, fontWeight: '800', color: 'rgba(0,0,0,0.35)' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ahassPill: { backgroundColor: '#c5dbf9', borderRadius: 15, paddingHorizontal: 6, paddingVertical: 2 },
  ahassText: { color: umotor.heroDark, fontSize: 7, fontWeight: '600' },
  meta: { fontSize: 8, fontWeight: '500', color: 'rgba(0,0,0,0.35)' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotText: { fontSize: 8, color: '#00a86b' },

  bookPill: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2b6fd0', borderRadius: 999, paddingLeft: 12, paddingRight: 4, paddingVertical: 4 },
  bookText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  bookArrow: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  empty: { textAlign: 'center', color: umotor.sub, marginTop: 40 },
});
