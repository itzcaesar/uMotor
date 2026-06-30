import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRp, INSTALL_SERVICE_CODE, type Booking, type Sparepart } from '@umotor/shared';
import { Card, ErrorState, StatusBadge, astra, colors, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
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
  const insets = useSafeAreaInsets();
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
  const catalogValue = myParts.reduce((s, p) => s + (p.price ?? 0), 0);

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
      {/* ── Etalase summary → full management screen ────────────────────── */}
      <FadeInView>
        <PressableScale
          style={styles.etalase}
          onPress={() => router.push('/kelola-sparepart')}
          accessibilityRole="button"
          accessibilityLabel="Kelola etalase sparepart"
        >
          <View style={styles.etalaseIcon}>
            <Ionicons name="storefront" size={22} color={astra.primary} />
          </View>
          <View style={styles.etalaseInfo}>
            <Text style={styles.etalaseTitle}>Etalase Saya</Text>
            <Text style={styles.etalaseSub} numberOfLines={1}>
              {myParts.length > 0
                ? `${myParts.length} produk · nilai ${formatRp(catalogValue)}`
                : 'Belum ada produk — ketuk untuk menambah'}
            </Text>
          </View>
          <View style={styles.kelolaPill}>
            <Text style={styles.kelolaText}>Kelola</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </View>
        </PressableScale>
      </FadeInView>

      {/* ── Install orders heading + search ─────────────────────────────── */}
      <Text style={[styles.sectionTitle, styles.ordersTitle]}>Pesanan pemasangan</Text>
      {(orders.data?.length ?? 0) > 0 && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={astra.faint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama atau plat…"
            placeholderTextColor={astra.faint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <PressableScale
              onPress={() => setSearch('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Hapus pencarian"
            >
              <Ionicons name="close-circle" size={18} color="#cbd5e1" />
            </PressableScale>
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
        <RefreshControl
          refreshing={orders.isRefetching || catalog.isRefetching}
          onRefresh={() => {
            orders.refetch();
            catalog.refetch();
          }}
        />
      }
      renderItem={({ item, index }) => (
        <FadeInView index={index} style={styles.cell}>
          <PressableScale
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel={`Lihat pesanan sparepart ${item.users?.name ?? 'pelanggan'}`}
            onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
          >
            <Card style={styles.orderCard}>
              <View style={styles.orderTop}>
                <View style={styles.thumb}>
                  <Ionicons name="construct" size={24} color={astra.primary} />
                </View>
                <View style={styles.orderInfo}>
                  <View style={styles.orderHeadRow}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {item.users?.name ?? '—'}
                    </Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.bike} numberOfLines={1}>
                    {item.motorcycles
                      ? `${item.motorcycles.model} · ${item.motorcycles.plate}`
                      : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.parts}>
                {item.booking_parts.map((p, i) => (
                  <View key={`${item.id}-${i}`} style={styles.partRow}>
                    <Ionicons name="cube-outline" size={14} color={astra.primary} />
                    <Text style={styles.partName} numberOfLines={1}>
                      {p.spareparts?.name ?? 'Sparepart'}
                      {p.qty > 1 ? ` ×${p.qty}` : ''}
                    </Text>
                    <Text style={styles.partPrice}>{formatRp(p.unit_price * p.qty)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.orderFooter}>
                <View style={styles.paidWrap}>
                  <Text style={styles.paidLabel}>Dibayar di muka</Text>
                  <Text style={styles.paidValue}>{formatRp(item.total_amount ?? 0)}</Text>
                </View>
                <View style={styles.detailPill}>
                  <Text style={styles.detailPillText}>Detail</Text>
                  <Ionicons name="chevron-forward" size={14} color="#fff" />
                </View>
              </View>
            </Card>
          </PressableScale>
        </FadeInView>
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
  list: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  columns: { gap: 12 },
  header: { gap: 12, marginBottom: 2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: astra.primary },
  ordersTitle: { marginTop: 6 },

  // Etalase summary card → /kelola-sparepart
  etalase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: astra.line,
    padding: 14,
  },
  etalaseIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etalaseInfo: { flex: 1, gap: 2 },
  etalaseTitle: { fontWeight: '800', color: astra.ink, fontSize: 15 },
  etalaseSub: { color: astra.sub, fontSize: 12 },
  kelolaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: astra.primary,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
  },
  kelolaText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: astra.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Empty catalog
  catalogEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogEmptyText: { flex: 1, color: astra.faint, fontSize: 13, lineHeight: 18 },

  // Catalog product list
  catalogList: { gap: 12 },

  // Shared light-blue icon square (Figma wrench tile)
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Product card (catalog) ──────────────────────────────────────────────
  productCard: { gap: 14 },
  productTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productInfo: { flex: 1, gap: 2 },
  productMeta: { color: astra.faint, fontSize: 11, fontWeight: '700' },
  productName: { fontWeight: '800', color: astra.ink, fontSize: 15, lineHeight: 20 },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fitNote: { flex: 1, color: colors.accent, fontSize: 12, fontWeight: '600' },
  productFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  productPrice: { fontWeight: '800', color: astra.primary, fontSize: 18 },

  // Small blue pill action (Tambah)
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: astra.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Order card (install orders) ─────────────────────────────────────────
  cell: { flex: 1 },
  orderCard: { flex: 1, gap: 12 },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderInfo: { flex: 1, gap: 2 },
  orderHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customer: { flex: 1, fontSize: 15, fontWeight: '800', color: astra.ink },
  bike: { color: astra.sub, fontSize: 13 },

  parts: { gap: 8 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partName: { flex: 1, color: astra.ink, fontSize: 13 },
  partPrice: { color: astra.sub, fontSize: 13, fontWeight: '700' },

  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: astra.line,
  },
  paidWrap: { gap: 1 },
  paidLabel: { color: astra.faint, fontSize: 11, fontWeight: '600' },
  paidValue: { color: astra.primary, fontSize: 15, fontWeight: '800' },
  detailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: astra.primary,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
  },
  detailPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  empty: { textAlign: 'center', color: astra.faint, marginTop: 48, paddingHorizontal: 24 },

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
});
