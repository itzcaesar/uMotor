import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  INSTALL_SERVICE_CODE,
  formatRp,
  statusColor,
  type Booking,
  type BookingStatus,
} from '@umotor/shared';
import { Card, ErrorState, SectionTitle, StatusBadge, astra, colors, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type InboxRow = Booking & {
  users: { name: string } | null;
  motorcycles: { plate: string; brand: string; model: string } | null;
  services: { name: string; duration_min: number; code?: string } | null;
  slots: { slot_at: string } | null;
};

export default function Inbox() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  // Quick-accept straight from the card — saves opening the detail to tap Terima.
  const accept = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('update_booking_status', {
        p_booking_id: bookingId,
        p_status: 'confirmed' as BookingStatus,
      });
      if (error) throw error;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => notify('Gagal', (e as Error).message),
  });

  const inbox = useQuery({
    queryKey: ['inbox', workshopId],
    enabled: !!workshopId,
    // Polling fallback: new bookings still land if the realtime channel drops.
    refetchInterval: 15_000,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          '*, users(name), motorcycles(plate, brand, model), services(name, duration_min, code), slots(slot_at)',
        )
        .eq('workshop_id', workshopId!)
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Sparepart install orders live in their own tab, not the service inbox.
      return ((data ?? []) as InboxRow[]).filter(
        (b) => b.services?.code !== INSTALL_SERVICE_CODE,
      );
    },
  });

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = inbox.data ?? [];
    if (!q) return all;
    return all.filter((b) => {
      const name = b.users?.name?.toLowerCase() ?? '';
      const plate = b.motorcycles?.plate?.toLowerCase() ?? '';
      return name.includes(q) || plate.includes(q);
    });
  }, [inbox.data, q]);

  const header = (
    <View style={styles.headerWrap}>
      <SectionTitle>Inbox</SectionTitle>
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
          {(inbox.data?.length ?? 0) > 0 || q ? header : null}
        </>
      }
      refreshControl={
        <RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} />
      }
      renderItem={({ item, index }) => {
        const tint = statusColor[item.status];
        const slotTime = item.slots
          ? new Date(item.slots.slot_at).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : null;
        const badgeLabel = item.slots ? 'Slot' : item.is_home_service ? 'Layanan' : '';
        const badgeValue = item.slots ? slotTime : item.is_home_service ? 'Home' : '—';
        return (
          <FadeInView index={index} style={styles.cell}>
            <Card style={styles.cellCard}>
              {/* Card body is the "open detail" tappable. The Terima button
                  lives as a sibling below so we don't nest <button>s on web. */}
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Lihat booking ${item.users?.name ?? 'pelanggan'}`}
                onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
              >
                <View style={styles.cardRow}>
                  {/* Colored slot/status badge */}
                  <View style={[styles.badge, { backgroundColor: tint }]}>
                    {badgeLabel ? <Text style={styles.badgeLabel}>{badgeLabel}</Text> : null}
                    <Text style={styles.badgeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {badgeValue}
                    </Text>
                  </View>

                  {/* Booking details */}
                  <View style={styles.info}>
                    <View style={styles.topRow}>
                      <Text style={styles.customer} numberOfLines={1}>
                        {item.users?.name ?? '—'}
                      </Text>
                      <StatusBadge status={item.status} />
                    </View>
                    <Text style={styles.bike} numberOfLines={1}>
                      {item.motorcycles
                        ? `${item.motorcycles.brand} ${item.motorcycles.model} · ${item.motorcycles.plate}`
                        : '—'}
                    </Text>
                    <Text style={styles.service} numberOfLines={1}>
                      {item.services?.name ?? '—'}
                      {item.services ? ` · ${item.services.duration_min} menit` : ''}
                    </Text>
                    <Text style={styles.deposit}>Deposit lunas · {formatRp(item.deposit_amount)}</Text>
                  </View>
                </View>
              </PressableScale>

              {item.status === 'pending' && (
                <PressableScale
                  style={[styles.acceptBtn, accept.isPending && styles.acceptBusy]}
                  disabled={accept.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Terima booking"
                  onPress={() => accept.mutate(item.id)}
                >
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.acceptText}>Terima</Text>
                </PressableScale>
              )}
            </Card>
          </FadeInView>
        );
      }}
      ListEmptyComponent={
        inbox.isError ? (
          <ErrorState onRetry={() => inbox.refetch()} />
        ) : (
          <Text style={styles.empty}>
            {inbox.isLoading
              ? 'Memuat…'
              : q
                ? 'Tidak ada booking yang cocok.'
                : 'Belum ada booking masuk. Booking baru muncul di sini secara real-time.'}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: astra.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  columns: { gap: 12 },

  headerWrap: { gap: 12, marginBottom: 0 },
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

  cell: { flex: 1 },
  // Garasi-style light-blue booking card
  cellCard: {
    flex: 1,
    backgroundColor: '#eaf1fc',
    borderColor: '#dbe8fb',
    padding: 12,
    gap: 0,
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },

  // Colored square badge (status-tinted)
  badge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '700' },
  badgeValue: { color: '#fff', fontSize: 15, fontWeight: '800' },

  info: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  customer: { flex: 1, fontSize: 15, fontWeight: '800', color: astra.ink },
  bike: { color: astra.sub, fontSize: 13 },
  service: { color: astra.ink, fontSize: 13, fontWeight: '600' },
  deposit: { color: '#00a86b', fontSize: 12, fontWeight: '700', marginTop: 1 },

  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 12,
  },
  acceptBusy: { opacity: 0.6 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  empty: { textAlign: 'center', color: astra.faint, marginTop: 48, paddingHorizontal: 24 },
});
