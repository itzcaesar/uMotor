import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, INSTALL_SERVICE_CODE, type Booking, type Sparepart } from '@umotor/shared';
import { Card, ErrorState, StatusBadge, colors, useIsWide } from '@/components/ui';
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

type OrderRow = Booking & {
  users: { name: string } | null;
  motorcycles: { plate: string; model: string } | null;
  services: { code: string } | null;
  booking_parts: { qty: number; unit_price: number; spareparts: { name: string } | null }[];
};

export default function Orders() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const [search, setSearch] = useState('');

  const orders = useQuery({
    queryKey: ['orders', workshopId],
    enabled: !!workshopId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 15_000,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, model), services(code), booking_parts(qty, unit_price, spareparts(name))',
        )
        .eq('workshop_id', workshopId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      // Only marketplace "Pasang di bengkel" orders.
      return ((data ?? []) as OrderRow[]).filter(
        (b) => b.services?.code === INSTALL_SERVICE_CODE,
      );
    },
  });

  // The workshop's own marketplace listings (what it sells).
  const catalog = useQuery({
    queryKey: ['catalog', workshopId],
    enabled: !!workshopId,
    // Polling fallback in case the realtime channel drops mid-demo.
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

  const myParts = catalog.data ?? [];

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = orders.data ?? [];
    if (!q) return all;
    return all.filter((b) => {
      const name = b.users?.name?.toLowerCase() ?? '';
      const plate = b.motorcycles?.plate?.toLowerCase() ?? '';
      return name.includes(q) || plate.includes(q);
    });
  }, [orders.data, q]);

  const header = (
    <View style={styles.header}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Sparepart yang saya jual</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push('/sparepart-new')}
          accessibilityRole="button"
          accessibilityLabel="Tambah sparepart"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Tambah</Text>
        </Pressable>
      </View>
      {myParts.length === 0 ? (
        <Card style={styles.catalogEmpty}>
          <Ionicons name="pricetags-outline" size={22} color="#cbd5e1" />
          <Text style={styles.catalogEmptyText}>
            Belum ada produk. Tambahkan sparepart untuk dijual di marketplace.
          </Text>
        </Card>
      ) : (
        <View style={styles.catalogList}>
          {myParts.map((p) => (
            <Card key={p.id} style={styles.catalogRow}>
              <View style={styles.catalogThumb}>
                <Ionicons name="cube-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.catalogInfo}>
                <Text style={styles.catalogName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.catalogMeta}>
                  {CATEGORY_LABELS[p.category] ?? p.category}
                  {p.install_fee > 0 ? ` · pasang ${formatRp(p.install_fee)}` : ''}
                </Text>
              </View>
              <Text style={styles.catalogPrice}>{formatRp(p.price)}</Text>
            </Card>
          ))}
        </View>
      )}
      <Text style={[styles.sectionTitle, styles.ordersTitle]}>Pesanan pemasangan</Text>
      {(orders.data?.length ?? 0) > 0 && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#98a2b3" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama atau plat…"
            placeholderTextColor="#98a2b3"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hapus pencarian"
            >
              <Ionicons name="close-circle" size={18} color="#cbd5e1" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

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
        <RefreshControl
          refreshing={orders.isRefetching || catalog.isRefetching}
          onRefresh={() => {
            orders.refetch();
            catalog.refetch();
          }}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.cell}
          accessibilityRole="button"
          accessibilityLabel={`Lihat pesanan sparepart ${item.users?.name ?? 'pelanggan'}`}
          onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
        >
          <Card style={styles.cellCard}>
            <View style={styles.row}>
              <Text style={styles.customer}>{item.users?.name ?? '—'}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.bike}>
              {item.motorcycles ? `${item.motorcycles.model} · ${item.motorcycles.plate}` : '—'}
            </Text>
            <View style={styles.parts}>
              {item.booking_parts.map((p, i) => (
                <View key={`${item.id}-${i}`} style={styles.partRow}>
                  <Ionicons name="construct-outline" size={14} color={colors.primary} />
                  <Text style={styles.partName}>
                    {p.spareparts?.name ?? 'Sparepart'}
                    {p.qty > 1 ? ` ×${p.qty}` : ''}
                  </Text>
                  <Text style={styles.partPrice}>{formatRp(p.unit_price * p.qty)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.footerRow}>
              <Text style={styles.paid}>Dibayar di muka · {formatRp(item.total_amount ?? 0)}</Text>
              <Text style={styles.cta}>Detail →</Text>
            </View>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        orders.isError ? (
          <ErrorState onRetry={() => orders.refetch()} />
        ) : (
          <Text style={styles.empty}>
            {orders.isLoading
              ? 'Memuat…'
              : q
                ? 'Tidak ada pesanan yang cocok.'
                : 'Belum ada pesanan sparepart. Pesanan "Pasang di bengkel" dari marketplace muncul di sini.'}
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
  header: { gap: 10, marginBottom: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727' },
  ordersTitle: { marginTop: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  catalogEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catalogEmptyText: { flex: 1, color: '#98a2b3', fontSize: 13 },
  catalogList: { gap: 8 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  catalogThumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e2f6ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogInfo: { flex: 1, gap: 2 },
  catalogName: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  catalogMeta: { color: '#667085', fontSize: 12 },
  catalogPrice: { fontWeight: '800', color: colors.primary, fontSize: 14 },
  cell: { flex: 1 },
  cellCard: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontSize: 16, fontWeight: '700', color: '#0b1727' },
  bike: { marginTop: 4, color: '#667085', fontSize: 13 },
  parts: { marginTop: 10, gap: 6 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partName: { flex: 1, color: '#0b1727', fontSize: 13 },
  partPrice: { color: '#667085', fontSize: 13, fontWeight: '600' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  paid: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  cta: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 48, paddingHorizontal: 24 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e9f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#0b1727', fontSize: 14, padding: 0 },
});
