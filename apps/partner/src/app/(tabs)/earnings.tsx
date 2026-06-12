import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const PLATFORM_FEE_PCT = 5; // simulated uMotor commission for the demo

interface CompletedRow {
  id: string;
  total_amount: number | null;
  updated_at: string;
  users: { name: string } | null;
  services: { name: string } | null;
}

export default function Earnings() {
  const workshopId = useSession((s) => s.workshopId);

  const data = useQuery({
    queryKey: ['earnings', workshopId],
    enabled: !!workshopId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, total_amount, updated_at, users(name), services(name)')
        .eq('workshop_id', workshopId!)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const all = (rows ?? []) as unknown as CompletedRow[];
      const today = new Date().toDateString();
      const todayRows = all.filter((r) => new Date(r.updated_at).toDateString() === today);
      const gross = todayRows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
      return { all, todayRows, gross };
    },
  });

  const gross = data.data?.gross ?? 0;
  const fee = Math.round((gross * PLATFORM_FEE_PCT) / 100);
  const net = gross - fee;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card style={styles.hero}>
        <Text style={styles.heroLabel}>Pendapatan hari ini</Text>
        <Text style={styles.heroValue}>{formatRp(net)}</Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroMetaText}>
            {data.data?.todayRows.length ?? 0} servis selesai · bruto {formatRp(gross)} − fee
            platform {PLATFORM_FEE_PCT}% ({formatRp(fee)})
          </Text>
        </View>
        <View style={styles.settle}>
          <Ionicons name="sync-circle" size={16} color="#bfe9d6" />
          <Text style={styles.settleText}>
            Settlement otomatis ke rekening AstraPay merchant setiap H+1
          </Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Servis selesai terakhir</Text>
      <Card>
        {(data.data?.all ?? []).slice(0, 10).map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="checkmark" size={16} color={colors.accent} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>
                {r.services?.name ?? 'Servis'} · {r.users?.name ?? '—'}
              </Text>
              <Text style={styles.rowDate}>
                {new Date(r.updated_at).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <Text style={styles.rowAmount}>
              {r.total_amount != null ? formatRp(r.total_amount) : '—'}
            </Text>
          </View>
        ))}
        {(data.data?.all.length ?? 0) === 0 && (
          <Text style={styles.empty}>
            {data.isLoading ? 'Memuat…' : 'Belum ada servis selesai.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: { backgroundColor: '#067647', borderColor: '#067647', gap: 4 },
  heroLabel: { color: '#bfe9d6', fontWeight: '600', fontSize: 13 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '800' },
  heroMeta: { marginTop: 2 },
  heroMetaText: { color: '#bfe9d6', fontSize: 12, lineHeight: 17 },
  settle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  settleText: { color: '#bfe9d6', fontSize: 11, flexShrink: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2f6ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, gap: 1 },
  rowTitle: { color: '#0b1727', fontWeight: '600', fontSize: 13 },
  rowDate: { color: '#98a2b3', fontSize: 11 },
  rowAmount: { color: '#0b1727', fontWeight: '800', fontSize: 13 },
  empty: { color: '#98a2b3' },
});
