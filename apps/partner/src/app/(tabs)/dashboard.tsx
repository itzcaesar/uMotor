import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  formatRp,
  STATUS_LABELS,
  statusColor,
  type Booking,
  type BookingStatus,
  type Workshop,
} from '@umotor/shared';
import { ActionTile, Card, ErrorState, astra, figAssets, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const PLATFORM_FEE_PCT = 5; // same simulated commission as the Pendapatan tab
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'in_progress'];

type StatsRow = Pick<Booking, 'id' | 'status' | 'total_amount' | 'created_at' | 'updated_at'> & {
  services: { name: string } | null;
};

interface DayBucket {
  label: string;
  count: number;
  isToday: boolean;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type Range = 'today' | 'all';

export default function Dashboard() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>('today');

  const stats = useQuery({
    queryKey: ['dashboard', workshopId],
    enabled: !!workshopId,
    // Polling fallback: stats stay fresh even if the realtime channel drops on stage.
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = startOfDay(new Date());
      since.setDate(since.getDate() - 6);
      const [rowsRes, activeRes, allRes, wRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, status, total_amount, created_at, updated_at, services(name)')
          .eq('workshop_id', workshopId!)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('workshop_id', workshopId!)
          .in('status', ACTIVE_STATUSES),
        // All-time completed totals (no date filter) for the "Semua waktu" toggle.
        supabase
          .from('bookings')
          .select('total_amount')
          .eq('workshop_id', workshopId!)
          .eq('status', 'completed')
          .limit(5000),
        supabase.from('workshops').select('*').eq('id', workshopId!).single(),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      if (allRes.error) throw allRes.error;
      if (wRes.error) throw wRes.error;

      const rows = (rowsRes.data ?? []) as unknown as StatsRow[];
      const todayKey = new Date().toDateString();

      // 7-day bar chart, oldest → today
      const days: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { label: DAY_LABELS[d.getDay()], count: 0, isToday: i === 6 };
      });
      const dayIndex = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        dayIndex.set(d.toDateString(), i);
      }
      for (const r of rows) {
        const idx = dayIndex.get(new Date(r.created_at).toDateString());
        if (idx != null) days[idx].count += 1;
      }

      const completed = rows.filter((r) => r.status === 'completed');
      const completedToday = completed.filter(
        (r) => new Date(r.updated_at).toDateString() === todayKey,
      );
      const grossToday = completedToday.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      const grossWeek = completed.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      const allCompleted = (allRes.data ?? []) as { total_amount: number | null }[];
      const grossAll = allCompleted.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      const net = (gross: number) => gross - Math.round((gross * PLATFORM_FEE_PCT) / 100);

      const byStatus = new Map<BookingStatus, number>();
      for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

      // Performance (7-day): of finished jobs, share completed vs cancelled;
      // average ticket across completed; cancellation share of all bookings.
      const cancelledWeek = byStatus.get('cancelled') ?? 0;
      const finished = completed.length + cancelledWeek;
      const completionRate = finished > 0 ? Math.round((completed.length / finished) * 100) : 0;
      const cancelRate = rows.length > 0 ? Math.round((cancelledWeek / rows.length) * 100) : 0;
      const avgTicket = completed.length > 0 ? Math.round(grossWeek / completed.length) : 0;

      const byService = new Map<string, number>();
      for (const r of rows) {
        const name = r.services?.name ?? 'Lainnya';
        byService.set(name, (byService.get(name) ?? 0) + 1);
      }
      const topServices = [...byService.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

      return {
        workshop: wRes.data as Workshop,
        days,
        newToday: rows.filter((r) => new Date(r.created_at).toDateString() === todayKey).length,
        activeCount: activeRes.count ?? 0,
        pendingWeek: byStatus.get('pending') ?? 0,
        completedToday: completedToday.length,
        grossToday,
        revenueToday: net(grossToday),
        revenueWeek: net(grossWeek),
        revenueAll: net(grossAll),
        completedAll: allCompleted.length,
        weekTotal: rows.length,
        byStatus,
        topServices,
        completionRate,
        cancelRate,
        avgTicket,
        completedWeek: completed.length,
      };
    },
  });

  const d = stats.data;
  if (stats.isError) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ErrorState onRetry={() => stats.refetch()} />
      </ScrollView>
    );
  }

  const maxDay = Math.max(1, ...(d?.days ?? []).map((x) => x.count));
  const maxService = Math.max(1, ...(d?.topServices ?? []).map(([, n]) => n));
  const moneyToday = d ? (range === 'today' ? d.revenueToday : d.revenueAll) : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        wide && styles.contentWide,
      ]}
      refreshControl={
        <RefreshControl refreshing={stats.isRefetching} onRefresh={() => stats.refetch()} />
      }
    >
      <GreetingBar />

      {/* Two-tone AstraPay balance card */}
      <FadeInView>
        <View style={styles.balance}>
          <View style={styles.balanceLeft}>
            <Text style={styles.balLabel}>
              {range === 'today' ? 'Pendapatan hari ini' : 'Pendapatan semua waktu'} · net
            </Text>
            <View style={styles.balValueRow}>
              <Text style={styles.balRp}>Rp</Text>
              <Text style={styles.balValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {d ? moneyToday.toLocaleString('id-ID') : '—'}
              </Text>
            </View>
            <View style={styles.balBtns}>
              <PressableScale style={styles.balBtn} onPress={() => router.push('/(tabs)/earnings')}>
                <Ionicons name="cash-outline" size={12} color="#fff" />
                <Text style={styles.balBtnText}>Tarik</Text>
              </PressableScale>
              <PressableScale style={styles.balBtn} onPress={() => router.push('/(tabs)/earnings')}>
                <Ionicons name="receipt-outline" size={12} color="#fff" />
                <Text style={styles.balBtnText}>Riwayat</Text>
              </PressableScale>
            </View>
            <View style={styles.balFootRow}>
              <Ionicons name="trending-up" size={11} color={astra.onHero} />
              <Text style={styles.balFoot}>
                {d ? `Bruto ${formatRp(range === 'today' ? d.grossToday : d.revenueAll)} · settlement H+1` : ' '}
              </Text>
            </View>
          </View>

          <PressableScale style={styles.balanceRight} onPress={() => router.push('/(tabs)/queue')}>
            <View style={styles.balRightHead}>
              <Text style={styles.balRightLabel}>Antrian</Text>
              <Ionicons name="chevron-forward" size={13} color={astra.onHero} />
            </View>
            <Text style={styles.balRightValue}>{d ? d.activeCount : '—'}</Text>
            <Text style={styles.balRightSub}>{d ? `${d.newToday} baru hari ini` : ' '}</Text>
          </PressableScale>
        </View>
      </FadeInView>

      {/* Range toggle drives the balance headline */}
      <View style={styles.toggle}>
        {(['today', 'all'] as Range[]).map((r) => (
          <PressableScale
            key={r}
            style={[styles.toggleBtn, range === r && styles.toggleBtnActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.toggleText, range === r && styles.toggleTextActive]}>
              {r === 'today' ? 'Hari ini' : 'Semua waktu'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {/* Action grid — light-blue tiles, blue Figma icons (3 × 2) */}
      <FadeInView index={1} style={styles.actionGrid}>
        <View style={styles.actionCell}>
          <ActionTile icon="qr-code" label="Scan QR" onPress={() => router.push('/scan')} />
        </View>
        <View style={styles.actionCell}>
          <ActionTile img={figAssets.icFlatTire} label="Sparepart" onPress={() => router.push('/sparepart-new')} />
        </View>
        <View style={styles.actionCell}>
          <ActionTile img={figAssets.icCalendar} label="Jadwal" onPress={() => router.push('/(tabs)/slots')} />
        </View>
        <View style={styles.actionCell}>
          <ActionTile icon="list" label="Antrian" onPress={() => router.push('/(tabs)/queue')} />
        </View>
        <View style={styles.actionCell}>
          <ActionTile icon="mail" label="Inbox" onPress={() => router.push('/(tabs)')} />
        </View>
        <View style={styles.actionCell}>
          <ActionTile icon="cash" label="Pendapatan" onPress={() => router.push('/(tabs)/earnings')} />
        </View>
      </FadeInView>

      {/* Reminder / call-to-action card (Figma "Moto Reminders") */}
      <Text style={styles.sectionTitle}>Pengingat</Text>
      <FadeInView index={2}>
        <View style={styles.reminder}>
          <Image source={figAssets.reminderIllus} style={styles.reminderIllus} resizeMode="contain" />
          <View style={styles.reminderBody}>
            <Text style={styles.reminderHi}>Halo, Mitra!</Text>
            <Text style={styles.reminderTitle}>
              {d && d.pendingWeek > 0
                ? `${d.pendingWeek} booking menunggu konfirmasi`
                : 'Semua booking sudah tertangani 🎉'}
            </Text>
            <PressableScale style={styles.reminderBtn} onPress={() => router.push('/(tabs)')}>
              <Text style={styles.reminderBtnText}>Lihat Inbox sekarang!</Text>
            </PressableScale>
          </View>
        </View>
      </FadeInView>

      {/* Statistics */}
      <Text style={styles.sectionTitle}>Statistik</Text>
      <FadeInView index={3} style={[styles.split, wide && styles.splitWide]}>
        <Card style={[styles.chartCard, wide && styles.splitItem]}>
          <Text style={styles.cardTitle}>Booking 7 hari terakhir</Text>
          <Text style={styles.cardSub}>
            {d ? `${d.weekTotal} booking · net ${formatRp(d.revenueWeek)}` : ' '}
          </Text>
          <View style={styles.chart}>
            {(d?.days ?? []).map((day, i) => (
              <View key={i} style={styles.chartCol}>
                <Text style={styles.chartCount}>{day.count > 0 ? day.count : ''}</Text>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, (day.count / maxDay) * 110),
                      backgroundColor: day.isToday ? astra.primary : '#cfe0f7',
                    },
                  ]}
                />
                <Text style={[styles.chartLabel, day.isToday && styles.chartLabelToday]}>
                  {day.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={[styles.breakCard, wide && styles.splitItem]}>
          <Text style={styles.cardTitle}>Status booking (7 hari)</Text>
          {(['pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled'] as BookingStatus[]).map(
            (s) => {
              const n = d?.byStatus.get(s) ?? 0;
              return (
                <View key={s} style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor[s] }]} />
                  <Text style={styles.statusLabel}>{STATUS_LABELS[s]}</Text>
                  <Text style={styles.statusCount}>{n}</Text>
                </View>
              );
            },
          )}
        </Card>
      </FadeInView>

      <FadeInView index={4}>
        <Card>
          <Text style={styles.cardTitle}>Performa minggu ini</Text>
          <View style={styles.perfRow}>
            <Perf label="Penyelesaian" value={d ? `${d.completionRate}%` : '—'} tint={colors.accent} />
            <Perf
              label="Rata-rata transaksi"
              value={d ? formatRp(d.avgTicket) : '—'}
              tint={astra.primary}
              small
            />
            <Perf label="Pembatalan" value={d ? `${d.cancelRate}%` : '—'} tint={colors.danger} />
          </View>
          <Text style={styles.perfHint}>
            {d ? `${d.completedWeek} servis selesai dari ${d.weekTotal} booking minggu ini` : ' '}
          </Text>
        </Card>
      </FadeInView>

      <FadeInView index={5}>
        <Card>
          <Text style={styles.cardTitle}>Layanan terpopuler (7 hari)</Text>
          {(d?.topServices ?? []).map(([name, n]) => (
            <View key={name} style={styles.svcRow}>
              <Text style={styles.svcName} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.svcTrack}>
                <View style={[styles.svcFill, { width: `${(n / maxService) * 100}%` }]} />
              </View>
              <Text style={styles.svcCount}>{n}</Text>
            </View>
          ))}
          {d && d.topServices.length === 0 && (
            <Text style={styles.empty}>Belum ada booking minggu ini.</Text>
          )}
        </Card>
      </FadeInView>

      <Text style={styles.settleText}>
        Net = bruto − {PLATFORM_FEE_PCT}% fee platform · settlement H+1 ke AstraPay merchant
      </Text>
    </ScrollView>
  );
}

function Perf({
  label,
  value,
  tint,
  small = false,
}: {
  label: string;
  value: string;
  tint: string;
  small?: boolean;
}) {
  return (
    <View style={styles.perf}>
      <Text
        style={[styles.perfValue, small && styles.perfValueSmall, { color: tint }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.perfLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: astra.bg },
  content: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 32, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },

  // Two-tone balance card
  balance: {
    flexDirection: 'row',
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 138,
    zIndex: 1,
    backgroundColor: astra.heroDark,
  },
  balanceLeft: {
    flex: 1.75,
    backgroundColor: astra.heroMid,
    padding: 18,
    justifyContent: 'center',
    gap: 7,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
  },
  balLabel: { color: '#dbe9ff', fontSize: 11, fontWeight: '600' },
  balValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  balRp: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  balValue: { color: '#fff', fontSize: 36, fontWeight: '800', flex: 1 },
  balBtns: { flexDirection: 'row', gap: 6, marginTop: 2 },
  balBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  balBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  balFootRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  balFoot: { color: astra.onHero, fontSize: 10, fontWeight: '600', flexShrink: 1 },
  balanceRight: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, paddingLeft: 22, justifyContent: 'center', gap: 2 },
  balRightHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balRightLabel: { color: '#dbe9ff', fontSize: 11, fontWeight: '600' },
  balRightValue: { color: '#fff', fontSize: 36, fontWeight: '800' },
  balRightSub: { color: astra.onHero, fontSize: 10, fontWeight: '600' },

  toggle: { flexDirection: 'row', backgroundColor: '#e9eef5', borderRadius: 10, padding: 3, gap: 3 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '700', color: astra.sub },
  toggleTextActive: { color: astra.primary },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  actionCell: { width: '31%', alignItems: 'center' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: astra.primary, marginTop: 2 },

  // Reminder card
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: astra.line,
    padding: 14,
  },
  reminderIllus: { width: 78, height: 96 },
  reminderBody: { flex: 1, gap: 4 },
  reminderHi: { color: astra.sub, fontSize: 13, fontWeight: '600' },
  reminderTitle: { color: astra.primary, fontSize: 16, fontWeight: '800', lineHeight: 20 },
  reminderBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: astra.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reminderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  split: { gap: 12 },
  splitWide: { flexDirection: 'row', alignItems: 'stretch' },
  splitItem: { flex: 1 },
  chartCard: { gap: 2 },
  breakCard: { gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: astra.ink },
  cardSub: { color: astra.sub, fontSize: 12 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 150,
  },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartCount: { fontSize: 11, fontWeight: '700', color: astra.sub },
  bar: { width: 22, borderRadius: 6 },
  chartLabel: { fontSize: 11, color: astra.faint, fontWeight: '600' },
  chartLabelToday: { color: astra.primary, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, color: '#344054', fontSize: 13, fontWeight: '600' },
  statusCount: { color: astra.ink, fontWeight: '800', fontSize: 14 },
  perfRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  perf: { flex: 1, alignItems: 'center', gap: 3 },
  perfValue: { fontSize: 22, fontWeight: '800' },
  perfValueSmall: { fontSize: 15 },
  perfLabel: { fontSize: 11, color: astra.sub, textAlign: 'center', lineHeight: 14 },
  perfHint: { color: astra.faint, fontSize: 11, marginTop: 10, textAlign: 'center' },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  svcName: { width: 110, color: '#344054', fontSize: 13, fontWeight: '600' },
  svcTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#eef1f6', overflow: 'hidden' },
  svcFill: { height: 8, borderRadius: 4, backgroundColor: astra.primary },
  svcCount: { width: 24, textAlign: 'right', color: astra.ink, fontWeight: '800', fontSize: 13 },
  empty: { color: astra.faint, marginTop: 8 },
  settleText: { color: astra.faint, fontSize: 11, textAlign: 'center', paddingHorizontal: 4 },
});
