import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRp, type Sparepart } from '@umotor/shared';
import { ErrorState, Pill, astra, useIsWide } from '@/components/ui';
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
const CAT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  oil: 'water',
  filter: 'filter',
  battery: 'battery-charging',
  brake: 'disc',
  tire: 'ellipse',
  accessory: 'sparkles',
};
type Sort = 'name' | 'price' | 'category';

export default function KelolaSparepart() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('category');

  const catalog = useQuery({
    queryKey: ['catalog', workshopId],
    enabled: !!workshopId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Sparepart[]> => {
      const { data, error } = await supabase
        .from('spareparts')
        .select('*')
        .eq('workshop_id', workshopId!)
        .order('category');
      if (error) throw error;
      return (data ?? []) as Sparepart[];
    },
  });

  const parts = catalog.data ?? [];
  const totalValue = useMemo(() => parts.reduce((s, p) => s + (p.price ?? 0), 0), [parts]);

  // Category chips present in the catalog, with counts.
  const catChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of parts) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [parts]);

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    let list = parts;
    if (cat !== 'all') list = list.filter((p) => p.category === cat);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price') sorted.sort((a, b) => b.price - a.price);
    else sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return sorted;
  }, [parts, cat, q, sort]);

  const header = (
    <View style={styles.headerStack}>
      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryGlow} pointerEvents="none" />
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Etalase Saya</Text>
            <Text style={styles.summaryValue}>{parts.length} produk</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryLabel}>Total nilai</Text>
            <Text style={styles.summaryValue}>{formatRp(totalValue)}</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={astra.faint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau merek…"
          placeholderTextColor={astra.faint}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Hapus pencarian">
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </Pressable>
        )}
      </View>

      {/* Category filter */}
      {catChips.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[['all', parts.length] as [string, number], ...catChips]}
          keyExtractor={(c) => c[0]}
          contentContainerStyle={styles.chips}
          renderItem={({ item: [key, n] }) => (
            <Pill
              label={`${key === 'all' ? 'Semua' : CATEGORY_LABELS[key] ?? key} ${n}`}
              active={cat === key}
              onPress={() => setCat(key)}
            />
          )}
        />
      )}

      {/* Sort */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Urutkan</Text>
        {(
          [
            ['category', 'Kategori'],
            ['name', 'Nama'],
            ['price', 'Harga'],
          ] as [Sort, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.sortChip, sort === key && styles.sortChipActive]}
            onPress={() => setSort(key)}
          >
            <Text style={[styles.sortChipText, sort === key && styles.sortChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        key={wide ? 'wide' : 'narrow'}
        numColumns={wide ? 2 : 1}
        columnWrapperStyle={wide ? styles.columns : undefined}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 96 },
          wide && styles.contentWide,
        ]}
        data={rows}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={catalog.isRefetching} onRefresh={() => catalog.refetch()} />
        }
        renderItem={({ item: p }) => (
          <Pressable
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${p.name}`}
            onPress={() => router.push({ pathname: '/sparepart-new', params: { id: p.id } })}
          >
            <View style={styles.row}>
              <View style={styles.thumb}>
                <Ionicons name={CAT_ICON[p.category] ?? 'cube'} size={22} color={astra.primary} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {p.brand ? `${p.brand} · ` : ''}
                  {CATEGORY_LABELS[p.category] ?? p.category}
                  {p.install_fee > 0 ? ` · pasang ${formatRp(p.install_fee)}` : ''}
                </Text>
              </View>
              <Text style={styles.price}>{formatRp(p.price)}</Text>
              <Ionicons name="chevron-forward" size={16} color={astra.faint} />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          catalog.isError ? (
            <ErrorState onRetry={() => catalog.refetch()} />
          ) : (
            <Text style={styles.empty}>
              {catalog.isLoading
                ? 'Memuat…'
                : q || cat !== 'all'
                  ? 'Tidak ada produk yang cocok.'
                  : 'Belum ada produk. Ketuk + untuk menambah.'}
            </Text>
          )
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/sparepart-new')}
        accessibilityRole="button"
        accessibilityLabel="Tambah produk"
      >
        <Ionicons name="add" size={26} color="#fff" />
        <Text style={styles.fabText}>Produk</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 10 },
  contentWide: { maxWidth: 900, width: '100%', alignSelf: 'center' },
  columns: { gap: 10 },
  headerStack: { gap: 12, marginBottom: 2 },

  summary: {
    backgroundColor: astra.heroDark,
    borderRadius: 18,
    padding: 18,
    overflow: 'hidden',
  },
  summaryGlow: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: astra.heroMid,
    opacity: 0.5,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRight: { alignItems: 'flex-end' },
  summaryLabel: { color: astra.onHero, fontSize: 12, fontWeight: '600' },
  summaryValue: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: astra.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: astra.ink, fontSize: 14, padding: 0 },

  chips: { gap: 8, paddingVertical: 2 },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortLabel: { color: astra.sub, fontSize: 12, fontWeight: '700' },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#eef1f6' },
  sortChipActive: { backgroundColor: astra.tile },
  sortChipText: { color: astra.sub, fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: astra.primary },

  cell: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: astra.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  thumb: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontWeight: '800', color: astra.ink, fontSize: 14 },
  meta: { color: astra.sub, fontSize: 12 },
  price: { fontWeight: '800', color: astra.primary, fontSize: 14 },

  empty: { textAlign: 'center', color: astra.faint, marginTop: 40, paddingHorizontal: 24 },

  fab: {
    position: 'absolute',
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: astra.primary,
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 20,
    paddingVertical: 14,
    shadowColor: '#0b1727',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
