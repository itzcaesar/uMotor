import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  formatRp,
  STATUS_LABELS,
  statusColor,
  type Booking,
  type BookingStatus,
  type Workshop,
} from '@umotor/shared';
import { Card, ErrorState, useIsWide } from '@/components/ui';
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
        completedToday: completedToday.length,
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      refreshControl={
        <RefreshControl refreshing={stats.isRefetching} onRefresh={() => stats.refetch()} />
      }
    >
      {/* Workshop header */}
      <Card style={styles.head}>
        <View style={styles.headInfo}>
          <Text style={styles.headName}>{d?.workshop.name ?? 'Memuat…'}</Text>
          <Text style={styles.headMeta}>
            {d
              ? `★ ${Number(d.workshop.rating).toFixed(1)} · ${
                  d.workshop.type === 'ahass' ? 'AHASS' : 'Independen'
                } · tier ${d.workshop.tier}`
              : ' '}
          </Text>
        </View>
        <View style={styles.headRight}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Pressable
            style={styles.gearBtn}
            onPress={() => router.push('/profile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Kelola bengkel"
          >
            <Ionicons name="settings-outline" size={20} color="#667085" />
          </Pressable>
        </View>
      </Card>

      {/* Quick actions */}
      <View style={styles.actions}>
        <QuickAction icon="qr-code" label="Scan QR" tint={colors.primary} onPress={() => router.push('/scan')} />
        <QuickAction
          icon="cube"
          label="Sparepart"
          tint="#7048e8"
          onPress={() => router.push('/sparepart-new')}
        />
        <QuickAction
          icon="time"
          label="Jadwal"
          tint={colors.warning}
          onPress={() => router.push('/(tabs)/slots')}
        />
        <QuickAction
          icon="list"
          label="Antrian"
          tint={colors.accent}
          onPress={() => router.push('/(tabs)/queue')}
        />
      </View>

      {/* KPI grid — 2 cols on phone, 4 on tablet */}
      <View style={styles.kpiGrid}>
        <Kpi
          wide={wide}
          icon="mail-unread"
          label="Booking baru hari ini"
          value={d ? String(d.newToday) : '—'}
          tint={colors.primary}
        />
        <Kpi
          wide={wide}
          icon="list"
          label="Antrian aktif"
          value={d ? String(d.activeCount) : '—'}
          tint="#7048e8"
        />
        <Kpi
          wide={wide}
          icon="checkmark-done"
          label={range === 'today' ? 'Selesai hari ini' : 'Total servis selesai'}
          value={d ? String(range === 'today' ? d.completedToday : d.completedAll) : '—'}
          tint={colors.accent}
        />
        <Kpi
          wide={wide}
          icon="cash"
          label={range === 'today' ? 'Pendapatan hari ini (net)' : 'Pendapatan semua waktu (net)'}
          value={d ? formatRp(range === 'today' ? d.revenueToday : d.revenueAll) : '—'}
          tint="#067647"
          small
        />
      </View>

      {/* Revenue range filter — applies to the two metrics above */}
      <View style={styles.toggle}>
        {(['today', 'all'] as Range[]).map((r) => (
          <Pressable
            key={r}
            style={[styles.toggleBtn, range === r && styles.toggleBtnActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.toggleText, range === r && styles.toggleTextActive]}>
              {r === 'today' ? 'Hari ini' : 'Semua waktu'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Chart + status breakdown — side by side on tablet */}
      <View style={[styles.split, wide && styles.splitWide]}>
        <Card style={[styles.chartCard, wide && styles.splitItem]}>
          <Text style={styles.sectionTitle}>Booking 7 hari terakhir</Text>
          <Text style={styles.sectionSub}>
            {d ? `${d.weekTotal} booking · pendapatan net ${formatRp(d.revenueWeek)}` : ' '}
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
                      backgroundColor: day.isToday ? colors.accent : '#bcd3f0',
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
          <Text style={styles.sectionTitle}>Status booking (7 hari)</Text>
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
      </View>

      {/* Performance */}
      <Card>
        <Text style={styles.sectionTitle}>Performa minggu ini</Text>
        <View style={styles.perfRow}>
          <Perf label="Penyelesaian" value={d ? `${d.completionRate}%` : '—'} tint={colors.accent} />
          <Perf
            label="Rata-rata transaksi"
            value={d ? formatRp(d.avgTicket) : '—'}
            tint={colors.primary}
            small
          />
          <Perf label="Pembatalan" value={d ? `${d.cancelRate}%` : '—'} tint={colors.danger} />
        </View>
        <Text style={styles.perfHint}>
          {d ? `${d.completedWeek} servis selesai dari ${d.weekTotal} booking minggu ini` : ' '}
        </Text>
      </Card>

      {/* Top services */}
      <Card>
        <Text style={styles.sectionTitle}>Layanan terpopuler (7 hari)</Text>
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

      <View style={styles.settle}>
        <Ionicons name="sync-circle-outline" size={14} color="#98a2b3" />
        <Text style={styles.settleText}>
          Net = bruto − {PLATFORM_FEE_PCT}% fee platform · settlement H+1 ke AstraPay merchant
        </Text>
      </View>
    </ScrollView>
  );
}

function Kpi({
  icon,
  label,
  value,
  tint,
  wide,
  small = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
  wide: boolean;
  small?: boolean;
}) {
  return (
    <Card style={[styles.kpi, { width: wide ? '23.5%' : '48.3%' }]}>
      <View style={[styles.kpiIcon, { backgroundColor: tint + '1a' }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text
        style={[styles.kpiValue, small && styles.kpiValueSmall]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint + '1a' }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
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
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headInfo: { gap: 2, flexShrink: 1 },
  headName: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  headMeta: { color: '#667085', fontSize: 12 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f3f6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  action: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#eef1f6',
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, fontWeight: '700', color: '#344054' },
  perfRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  perf: { flex: 1, alignItems: 'center', gap: 3 },
  perfValue: { fontSize: 22, fontWeight: '800' },
  perfValueSmall: { fontSize: 15 },
  perfLabel: { fontSize: 11, color: '#667085', textAlign: 'center', lineHeight: 14 },
  perfHint: { color: '#98a2b3', fontSize: 11, marginTop: 10, textAlign: 'center' },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e2f6ee',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  liveText: { color: colors.accent, fontWeight: '800', fontSize: 11 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#e9eef5',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#667085' },
  toggleTextActive: { color: '#0b1727' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  kpi: { gap: 6, padding: 14 },
  kpiIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 24, fontWeight: '800', color: '#0b1727' },
  kpiValueSmall: { fontSize: 17 },
  kpiLabel: { fontSize: 11, color: '#667085', lineHeight: 14 },
  split: { gap: 12 },
  splitWide: { flexDirection: 'row', alignItems: 'stretch' },
  splitItem: { flex: 1 },
  chartCard: { gap: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727' },
  sectionSub: { color: '#667085', fontSize: 12 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 150,
  },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartCount: { fontSize: 11, fontWeight: '700', color: '#667085' },
  bar: { width: 22, borderRadius: 6 },
  chartLabel: { fontSize: 11, color: '#98a2b3', fontWeight: '600' },
  chartLabelToday: { color: colors.accent, fontWeight: '800' },
  breakCard: { gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, color: '#344054', fontSize: 13, fontWeight: '600' },
  statusCount: { color: '#0b1727', fontWeight: '800', fontSize: 14 },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  svcName: { width: 110, color: '#344054', fontSize: 13, fontWeight: '600' },
  svcTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eef1f6',
    overflow: 'hidden',
  },
  svcFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  svcCount: { width: 24, textAlign: 'right', color: '#0b1727', fontWeight: '800', fontSize: 13 },
  empty: { color: '#98a2b3', marginTop: 8 },
  settle: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  settleText: { color: '#98a2b3', fontSize: 11, flexShrink: 1 },
});
