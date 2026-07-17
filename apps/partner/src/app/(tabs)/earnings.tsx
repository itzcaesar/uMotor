import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatRp } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ErrorState, SectionTitle, astra, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
import { jakartaDateKey, jakartaDayStart, jakartaWeekday } from '@/lib/dates';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Range = 'today' | 'all';

const PLATFORM_FEE_PCT = 5; // simulated uMotor commission for the demo
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

interface CompletedRow {
  id: string;
  total_amount: number | null;
  updated_at: string;
  users: { name: string } | null;
  services: { name: string } | null;
}

export default function Earnings() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>('today');

  const data = useQuery({
    queryKey: ['earnings', workshopId],
    enabled: !!workshopId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, total_amount, updated_at, users(name), services(name)')
        .eq('workshop_id', workshopId!)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const all = (rows ?? []) as unknown as CompletedRow[];
      const today = jakartaDateKey();
      const todayRows = all.filter((r) => jakartaDateKey(r.updated_at) === today);
      const grossToday = todayRows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      const grossAll = all.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      return { all, todayRows, grossToday, grossAll };
    },
  });

  const rangeRows = range === 'today' ? data.data?.todayRows ?? [] : data.data?.all ?? [];
  const gross = range === 'today' ? data.data?.grossToday ?? 0 : data.data?.grossAll ?? 0;
  const fee = Math.round((gross * PLATFORM_FEE_PCT) / 100);
  const net = gross - fee;
  const avgTicket = rangeRows.length ? Math.round(gross / rangeRows.length) : 0;

  // Last 7 days of NET revenue (bucketed client-side from completed bookings).
  const days = useMemo(() => {
    const all = data.data?.all ?? [];
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = jakartaDayStart(new Date(), -(6 - i));
      return {
        label: DAY_LABELS[jakartaWeekday(d)],
        key: jakartaDateKey(d),
        gross: 0,
        isToday: i === 6,
      };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const r of all) {
      const i = idx.get(jakartaDateKey(r.updated_at));
      if (i != null) buckets[i].gross += r.total_amount ?? 0;
    }
    return buckets.map((b) => ({
      label: b.label,
      isToday: b.isToday,
      net: b.gross - Math.round((b.gross * PLATFORM_FEE_PCT) / 100),
    }));
  }, [data.data]);
  const maxNet = Math.max(1, ...days.map((d) => d.net));

  if (data.isError) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ErrorState onRetry={() => data.refetch()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 }, wide && styles.contentWide]}
      refreshControl={
        <RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} />
      }
    >
      <GreetingBar />
      {/* Navy AstraPay header (mirrors the Finance "Saldo" header) */}
      <FadeInView>
        <View style={styles.hero}>
          <View style={styles.heroBrand}>
            <Ionicons name="wallet" size={16} color="#fff" />
            <Text style={styles.heroBrandText}>Pendapatan Mitra · net</Text>
          </View>
          <View style={styles.heroValueRow}>
            <Text style={styles.heroRp}>Rp</Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {net.toLocaleString('id-ID')}
            </Text>
          </View>
          <View style={styles.heroFootRow}>
            <Ionicons name="bar-chart" size={12} color={astra.onHero} />
            <Text style={styles.heroFoot}>
              Bruto {formatRp(gross)} − fee {PLATFORM_FEE_PCT}% ({formatRp(fee)})
            </Text>
          </View>
        </View>
      </FadeInView>

      {/* Overlapping mini-actions (Tabungan / Top Up / Tarik Tunai → workshop) */}
      <FadeInView delay={80} style={styles.miniRow}>
        <MiniAction icon="cash-outline" label="Tarik Dana" onPress={() => notify('Tarik Dana', 'Demo: dana otomatis settle H+1 ke AstraPay merchant.')} />
        <MiniAction icon="stats-chart-outline" label="Laporan" onPress={() => router.push('/(tabs)/dashboard')} />
        <MiniAction icon="sync-outline" label="Settlement" onPress={() => notify('Settlement', 'Settlement otomatis H+1 ke rekening AstraPay merchant.')} />
      </FadeInView>

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

      {/* 7-day net revenue chart */}
      <FadeInView index={1}>
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Pendapatan 7 hari (net)</Text>
          <View style={styles.chart}>
            {days.map((d, i) => (
              <View key={i} style={styles.chartCol}>
                <Text style={styles.chartVal}>{d.net > 0 ? `${Math.round(d.net / 1000)}k` : ''}</Text>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, (d.net / maxNet) * 90),
                      backgroundColor: d.isToday ? astra.primary : '#cfe0f7',
                    },
                  ]}
                />
                <Text style={[styles.chartLabel, d.isToday && styles.chartLabelToday]}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </FadeInView>

      {/* Summary: servis · rata-rata · fee */}
      <FadeInView index={2} style={styles.summary}>
        <SumStat value={String(rangeRows.length)} label="Servis selesai" />
        <View style={styles.sumDivider} />
        <SumStat value={formatRp(avgTicket)} label="Rata-rata" small />
        <View style={styles.sumDivider} />
        <SumStat value={formatRp(fee)} label={`Fee ${PLATFORM_FEE_PCT}%`} small />
      </FadeInView>

      <View style={styles.settleNote}>
        <Ionicons name="sync-circle" size={14} color={astra.faint} />
        <Text style={styles.settleText}>Settlement otomatis H+1 ke rekening AstraPay merchant</Text>
      </View>

      <SectionTitle>Servis selesai terakhir</SectionTitle>
      {rangeRows.slice(0, 12).map((r, i) => (
        <FadeInView key={r.id} index={i} style={styles.billCard}>
          <View style={styles.billIcon}>
            <Ionicons name="checkmark-circle" size={22} color={astra.primary} />
          </View>
          <View style={styles.billInfo}>
            <Text style={styles.billTitle} numberOfLines={1}>
              {r.services?.name ?? 'Servis'}
            </Text>
            <Text style={styles.billSub} numberOfLines={1}>
              {r.users?.name ?? '—'} ·{' '}
              {new Date(r.updated_at).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <Text style={styles.billAmount}>{r.total_amount != null ? formatRp(r.total_amount) : '—'}</Text>
        </FadeInView>
      ))}
      {rangeRows.length === 0 && (
        <Card>
          <Text style={styles.empty}>
            {data.isLoading
              ? 'Memuat…'
              : range === 'today'
                ? 'Belum ada servis selesai hari ini.'
                : 'Belum ada servis selesai.'}
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

function MiniAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.mini} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.miniTile}>
        <Ionicons name={icon} size={20} color={astra.primary} />
      </View>
      <Text style={styles.miniLabel}>{label}</Text>
    </PressableScale>
  );
}

function SumStat({ value, label, small = false }: { value: string; label: string; small?: boolean }) {
  return (
    <View style={styles.sumCol}>
      <Text
        style={[styles.sumVal, small && styles.sumValSmall]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.sumLab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },

  hero: {
    backgroundColor: astra.heroDark,
    marginHorizontal: -16,
    marginTop: 0,
    paddingTop: 24,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
    gap: 4,
  },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroBrandText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  heroRp: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroValue: { color: '#fff', fontSize: 46, fontWeight: '800', letterSpacing: -1 },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  heroFoot: { color: astra.onHero, fontSize: 12, fontWeight: '600' },

  miniRow: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: -26, zIndex: 1 },
  mini: { alignItems: 'center', gap: 5 },
  miniTile: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: astra.line,
    shadowColor: '#0b1727',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  miniLabel: { fontSize: 11, fontWeight: '700', color: astra.primary },

  toggle: { flexDirection: 'row', backgroundColor: '#e9eef5', borderRadius: 10, padding: 3, gap: 3, marginTop: 4 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '700', color: astra.sub },
  toggleTextActive: { color: astra.primary },

  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: astra.line,
    padding: 16,
  },
  chartTitle: { fontSize: 14, fontWeight: '800', color: astra.ink },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, marginTop: 12 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartVal: { fontSize: 10, fontWeight: '700', color: astra.sub },
  bar: { width: 20, borderRadius: 6 },
  chartLabel: { fontSize: 11, color: astra.faint, fontWeight: '600' },
  chartLabelToday: { color: astra.primary, fontWeight: '800' },

  summary: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: astra.line,
    paddingVertical: 14,
  },
  sumCol: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  sumVal: { color: astra.primary, fontSize: 18, fontWeight: '800' },
  sumValSmall: { fontSize: 14 },
  sumLab: { color: astra.sub, fontSize: 11, fontWeight: '600' },
  sumDivider: { width: 1, backgroundColor: astra.line, marginVertical: 6 },

  settleNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  settleText: { color: astra.faint, fontSize: 11 },

  billCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: astra.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  billIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billInfo: { flex: 1, gap: 1 },
  billTitle: { color: astra.ink, fontWeight: '700', fontSize: 14 },
  billSub: { color: astra.sub, fontSize: 12 },
  billAmount: { color: astra.primary, fontWeight: '800', fontSize: 14 },
  empty: { color: astra.faint },
});
