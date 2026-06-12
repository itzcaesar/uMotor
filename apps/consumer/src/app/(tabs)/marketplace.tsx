import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  formatRp,
  type ComponentType,
  type Sparepart,
} from '@umotor/shared';
import { Card } from '@/components/ui';
import { useCart } from '@/lib/cart';
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

// Which sparepart categories a worn component implies (Consumer PRD §3 — auto recommendation).
const NEEDS: Record<ComponentType, string[]> = {
  oil: ['oil', 'filter'],
  tire: ['tire'],
  battery: ['battery'],
  brake_pad: ['brake'],
  air_filter: ['filter'],
};

interface MarketData {
  parts: Sparepart[];
  models: string[];
  neededCategories: string[];
}

export default function Marketplace() {
  const userId = useSession((s) => s.userId);
  const add = useCart((s) => s.add);
  const [model, setModel] = useState<string>('all');

  const market = useQuery({
    queryKey: ['marketplace', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MarketData> => {
      const [partsRes, bikesRes] = await Promise.all([
        supabase.from('spareparts').select('*').order('category'),
        supabase.from('motorcycles').select('id, model').eq('user_id', userId!),
      ]);
      const models = (bikesRes.data ?? []).map((b) => b.model as string);
      const ids = (bikesRes.data ?? []).map((b) => b.id as string);
      // Components already due (>=80% used) drive the recommendation set.
      const { data: health } = await supabase
        .from('component_health')
        .select('type, pct_used, motorcycle_id')
        .in('motorcycle_id', ids);
      const needed = new Set<string>();
      for (const h of (health ?? []) as { type: ComponentType; pct_used: number }[]) {
        if (h.pct_used >= 80) NEEDS[h.type].forEach((c) => needed.add(c));
      }
      return {
        parts: (partsRes.data ?? []) as Sparepart[],
        models,
        neededCategories: [...needed],
      };
    },
  });

  const data = market.data;

  const fitsModel = (p: Sparepart, m: string) =>
    m === 'all' ? true : p.compatible_models.includes(m);

  const compatibleWithOwned = (p: Sparepart) =>
    !data ? false : p.compatible_models.some((m) => data.models.includes(m));

  const recommended = useMemo(() => {
    if (!data) return [];
    return data.parts.filter(
      (p) => compatibleWithOwned(p) && data.neededCategories.includes(p.category),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const list = useMemo(
    () => (data ? data.parts.filter((p) => fitsModel(p, model)) : []),
    [data, model],
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={list}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl refreshing={market.isRefetching} onRefresh={() => market.refetch()} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {/* Bike filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {['all', ...(data?.models ?? [])].map((m) => (
              <Pressable
                key={m}
                onPress={() => setModel(m)}
                style={[styles.chip, model === m && styles.chipActive]}
              >
                <Text style={[styles.chipText, model === m && styles.chipTextActive]}>
                  {m === 'all' ? 'Semua motor' : m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Recommendation rail */}
          {model === 'all' && recommended.length > 0 && (
            <View style={styles.recBlock}>
              <View style={styles.recHeader}>
                <Ionicons name="sparkles" size={16} color={colors.accent} />
                <Text style={styles.recTitle}>Direkomendasikan untuk motormu</Text>
              </View>
              <Text style={styles.recHint}>
                Berdasarkan kondisi komponen yang sudah mendekati interval servis.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recRail}
              >
                {recommended.map((p) => (
                  <View key={p.id} style={styles.recCard}>
                    <View style={styles.recThumb}>
                      <Ionicons name="construct" size={22} color={colors.primary} />
                    </View>
                    <Text style={styles.recName} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text style={styles.recPrice}>{formatRp(p.price)}</Text>
                    <Pressable style={styles.recAdd} onPress={() => add(p)}>
                      <Text style={styles.recAddText}>+ Keranjang</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={styles.sectionTitle}>
            {model === 'all' ? 'Semua sparepart' : `Cocok untuk ${model}`}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Card style={styles.row}>
          <View style={styles.thumb}>
            <Ionicons name="construct-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.brand ?? 'Generic'} · {CATEGORY_LABELS[item.category] ?? item.category}
            </Text>
            {compatibleWithOwned(item) && (
              <View style={styles.fitTag}>
                <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                <Text style={styles.fitText}>Cocok untuk motormu</Text>
              </View>
            )}
            <Text style={styles.price}>{formatRp(item.price)}</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => add(item)} hitSlop={6}>
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </Card>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {market.isLoading ? 'Memuat sparepart…' : 'Tidak ada sparepart untuk filter ini.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  header: { gap: 14, marginBottom: 2 },
  chips: { gap: 8, paddingRight: 8 },
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
  recBlock: {
    backgroundColor: '#e2f6ee',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  recHint: { color: '#4a7763', fontSize: 12, lineHeight: 16 },
  recRail: { gap: 10, paddingTop: 10, paddingRight: 4 },
  recCard: {
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#cdeadd',
  },
  recThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recName: { fontSize: 13, fontWeight: '700', color: '#0b1727', minHeight: 34 },
  recPrice: { fontWeight: '800', color: colors.primary },
  recAdd: {
    marginTop: 2,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  recAddText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#0b1727' },
  meta: { fontSize: 12, color: '#667085' },
  fitTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fitText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  price: { marginTop: 4, fontWeight: '800', color: colors.primary, fontSize: 15 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
});
