import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type ComponentType, type SparepartListing } from '@umotor/shared';
import { umotor, useResponsive } from '@/components/ui';
import { FadeInView, PressableScale } from '@/components/motion';
import { selectCount, useCart } from '@/lib/cart';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const CATEGORY_LABELS: Record<string, string> = {
  oil: 'Oli',
  filter: 'Filter',
  battery: 'Aki',
  brake: 'Rem',
  tire: 'Ban',
  accessory: 'Aksesoris',
};
const NEEDS: Record<ComponentType, string[]> = {
  oil: ['oil', 'filter'],
  tire: ['tire'],
  battery: ['battery'],
  brake_pad: ['brake'],
  air_filter: ['filter'],
};
const filterTileIcon = require('../../assets/figma/ic-air.png');

interface MarketData {
  parts: SparepartListing[];
  models: string[];
  neededCategories: string[];
}

export default function Marketplace() {
  const userId = useSession((s) => s.userId);
  const add = useCart((s) => s.add);
  const cartCount = useCart(selectCount);
  const [model, setModel] = useState<string>('all');
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const market = useQuery({
    queryKey: ['marketplace', userId],
    enabled: !!userId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<MarketData> => {
      const [partsRes, bikesRes] = await Promise.all([
        supabase.from('spareparts').select('*, workshops(name)').order('category'),
        supabase.from('motorcycles').select('id, model').eq('user_id', userId!),
      ]);
      const models = (bikesRes.data ?? []).map((b) => b.model as string);
      const ids = (bikesRes.data ?? []).map((b) => b.id as string);
      const { data: health } = await supabase
        .from('component_health')
        .select('type, pct_used, motorcycle_id')
        .in('motorcycle_id', ids);
      const needed = new Set<string>();
      for (const h of (health ?? []) as { type: ComponentType; pct_used: number }[]) {
        if (h.pct_used >= 80) NEEDS[h.type].forEach((c) => needed.add(c));
      }
      type Row = SparepartListing & { workshops: { name: string } | null };
      const parts = ((partsRes.data ?? []) as Row[]).map((p) => ({ ...p, seller_name: p.workshops?.name ?? null }));
      return { parts, models, neededCategories: [...needed] };
    },
  });

  const data = market.data;
  const fitsModel = (p: SparepartListing, m: string) => (m === 'all' ? true : p.compatible_models.includes(m));
  const compatibleWithOwned = (p: SparepartListing) =>
    !data ? false : p.compatible_models.some((m) => data.models.includes(m));

  const recommended = useMemo(() => {
    if (!data) return [];
    return data.parts.filter((p) => compatibleWithOwned(p) && data.neededCategories.includes(p.category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const list = useMemo(() => (data ? data.parts.filter((p) => fitsModel(p, model)) : []), [data, model]);

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale style={styles.circleBtn} onPress={() => safeBack('/(tabs)')} accessibilityLabel="Kembali">
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </PressableScale>
        <Text style={styles.headerTitle}>Sparepart</Text>
        <View style={{ flex: 1 }} />
        <PressableScale style={styles.circleBtn} onPress={() => router.push('/cart')} accessibilityLabel="Keranjang">
          <Ionicons name="cart" size={20} color="#fff" />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </PressableScale>
      </View>

      <FlatList
        key={r.columns}
        numColumns={r.columns}
        columnWrapperStyle={r.columns > 1 ? styles.columns : undefined}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, r.isTablet && { maxWidth: 760, width: '100%', alignSelf: 'center' }]}
        data={list}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={market.isRefetching} onRefresh={() => market.refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {['all', ...(data?.models ?? [])].map((m) => (
                <PressableScale key={m} onPress={() => setModel(m)} style={[styles.chip, model === m && styles.chipActive]}>
                  <Text style={[styles.chipText, model === m && styles.chipTextActive]}>{m === 'all' ? 'Semua Motor' : m}</Text>
                </PressableScale>
              ))}
            </ScrollView>

            {model === 'all' && recommended.length > 0 && (
              <View style={styles.recBlock}>
                <View style={styles.recHeader}>
                  <Ionicons name="sparkles" size={18} color="#2bb673" />
                  <Text style={styles.recTitle}>Direkomendasikan untuk motormu!</Text>
                </View>
                <Text style={styles.recHint}>Berdasarkan kondisi komponen yang sudah mendekati interval servis.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recRail}>
                  {recommended.map((p, i) => (
                    <FadeInView key={p.id} index={i} step={45}>
                      <View style={styles.recCard}>
                        <View style={styles.recThumb}>
                          <Image source={filterTileIcon} style={styles.recThumbImg} contentFit="contain" tintColor={umotor.heroDark} />
                        </View>
                        <Text style={styles.recName} numberOfLines={1}>{p.name}</Text>
                        {p.seller_name && <Text style={styles.recSeller} numberOfLines={1}>{p.seller_name}</Text>}
                        <Text style={styles.recPrice}>{formatRp(p.price)}</Text>
                        <PressableScale style={styles.recAdd} onPress={() => add(p)}>
                          <Text style={styles.recAddText}>+ Keranjang</Text>
                        </PressableScale>
                      </View>
                    </FadeInView>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{model === 'all' ? 'Semua Sparepart' : `Cocok untuk ${model}`}</Text>
              <Ionicons name="options-outline" size={20} color={umotor.heroDark} />
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <FadeInView index={index} style={styles.cellCard}>
            <View style={[styles.card, styles.cellCard]}>
              <View style={styles.cardTop}>
                <View style={styles.thumb}>
                  <Ionicons name="construct" size={30} color={umotor.heroDark} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.brand ?? 'Generic'} | {CATEGORY_LABELS[item.category] ?? item.category}
                    {item.seller_name ? `   ${item.seller_name}` : ''}
                  </Text>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  {compatibleWithOwned(item) && (
                    <View style={styles.fitTag}>
                      <Ionicons name="checkmark-circle" size={13} color="#2bb673" />
                      <Text style={styles.fitText}>Yay! Sparepart ini cocok untuk motormu.</Text>
                    </View>
                  )}
                  <Text style={styles.installNote}>+{formatRp(item.install_fee)} jika pasang di bengkel</Text>
                </View>
                <Text style={styles.price}>{formatRp(item.price)}</Text>
              </View>
              <PressableScale style={styles.addBtn} onPress={() => add(item)} accessibilityRole="button" accessibilityLabel={`Tambah ${item.name} ke keranjang`}>
                <Ionicons name="cart-outline" size={15} color="#fff" />
                <Text style={styles.addBtnText}>Tambahkan Keranjang</Text>
              </PressableScale>
            </View>
          </FadeInView>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {market.isLoading ? 'Memuat sparepart…' : market.isError ? 'Gagal memuat. Tarik untuk muat ulang.' : 'Tidak ada sparepart untuk filter ini.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12, backgroundColor: umotor.bg },
  circleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: umotor.heroDark, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: umotor.heroDark },
  cartBadge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#e0543f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  content: { padding: 16, gap: 12 },
  columns: { gap: 12 },
  cellCard: { flex: 1 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#dbe9ff' },
  chipActive: { backgroundColor: umotor.heroDark },
  chipText: { color: umotor.heroDark, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  recBlock: { backgroundColor: '#e6f5ec', borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: '#cfead9' },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recTitle: { fontWeight: '800', color: umotor.heroDark, fontSize: 15 },
  recHint: { color: '#5a7a68', fontSize: 11, lineHeight: 15 },
  recRail: { gap: 10, paddingTop: 10, paddingRight: 4 },
  recCard: { width: 140, backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 6 },
  recThumb: { width: 38, height: 38, borderRadius: 10, backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  recThumbImg: { width: 22, height: 22 },
  recName: { fontSize: 13, fontWeight: '700', color: umotor.ink },
  recSeller: { fontSize: 10, color: umotor.sub },
  recPrice: { fontWeight: '800', color: umotor.primary, fontSize: 14 },
  recAdd: { marginTop: 2, backgroundColor: umotor.heroDark, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  recAddText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: umotor.heroDark },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 30, height: 30 },
  info: { flex: 1, gap: 2 },
  meta: { fontSize: 11, color: umotor.primary, fontWeight: '600' },
  name: { fontSize: 17, fontWeight: '800', color: umotor.ink },
  fitTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fitText: { fontSize: 11, color: '#2bb673', fontWeight: '600' },
  installNote: { fontSize: 10, color: umotor.faint, marginTop: 1 },
  price: { fontWeight: '800', color: umotor.primary, fontSize: 16 },
  addBtn: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: umotor.heroMid, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: umotor.faint, marginTop: 48 },
});
