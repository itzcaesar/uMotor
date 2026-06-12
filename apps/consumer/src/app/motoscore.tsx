import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type MotoScore } from '@umotor/shared';
import { Card } from '@/components/ui';
import { ScoreGauge } from '@/components/Gauge';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface HistoryRow {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
}

// Visual only — sells the proposal's key innovation (financial products unlocked by score).
const PRODUCTS = [
  {
    icon: 'flash' as const,
    title: 'Pinjaman darurat',
    desc: 'Rp 500rb – 5 jt cair dalam 5 menit untuk servis mendadak',
    min: 650,
  },
  {
    icon: 'shield-checkmark' as const,
    title: 'Asuransi motor',
    desc: 'Premi dipersonalisasi dari pola perawatan motormu',
    min: 600,
  },
  {
    icon: 'card' as const,
    title: 'Cicilan sparepart 0%',
    desc: 'Untuk MotoScore di atas 700',
    min: 700,
  },
];

export default function MotoScoreScreen() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();

  const data = useQuery({
    queryKey: ['motoscore', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [score, history] = await Promise.all([
        supabase.from('motoscore').select('*').eq('user_id', userId!).single(),
        supabase
          .from('motoscore_history')
          .select('*')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      return {
        score: (score.data as MotoScore | null)?.score ?? 600,
        history: (history.data ?? []) as HistoryRow[],
      };
    },
  });

  // Score changes land live (e.g. +5 right after the partner completes the service).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('motoscore-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'motoscore', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['motoscore', userId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  const score = data.data?.score ?? 600;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card style={styles.gaugeCard}>
        <ScoreGauge score={score} />
        <Text style={styles.gaugeHint}>
          Dihitung dari ketepatan servis, pembayaran tagihan, dan kondisi motormu — bukan riwayat
          kredit bank.
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Produk yang terbuka untukmu</Text>
      {PRODUCTS.map((p) => {
        const unlocked = score >= p.min;
        return (
          <Card key={p.title} style={[styles.product, !unlocked && styles.productLocked]}>
            <View style={[styles.productIcon, unlocked && styles.productIconUnlocked]}>
              <Ionicons name={p.icon} size={20} color={unlocked ? '#fff' : '#98a2b3'} />
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productTitle}>{p.title}</Text>
              <Text style={styles.productDesc}>{p.desc}</Text>
            </View>
            <Ionicons
              name={unlocked ? 'lock-open' : 'lock-closed'}
              size={18}
              color={unlocked ? colors.accent : '#cbd5e1'}
            />
          </Card>
        );
      })}

      <Text style={styles.sectionTitle}>Riwayat skor</Text>
      <Card>
        {(data.data?.history ?? []).map((h) => (
          <View key={h.id} style={styles.histRow}>
            <View style={[styles.delta, h.delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
              <Text style={[styles.deltaText, { color: h.delta >= 0 ? colors.accent : colors.danger }]}>
                {h.delta >= 0 ? `+${h.delta}` : h.delta}
              </Text>
            </View>
            <View style={styles.histInfo}>
              <Text style={styles.histReason}>{h.reason}</Text>
              <Text style={styles.histDate}>
                {new Date(h.created_at).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        ))}
        {data.data?.history.length === 0 && <Text style={styles.empty}>Belum ada riwayat.</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  gaugeCard: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  gaugeHint: { color: '#667085', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productLocked: { opacity: 0.75 },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconUnlocked: { backgroundColor: colors.primary },
  productInfo: { flex: 1, gap: 2 },
  productTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  productDesc: { color: '#667085', fontSize: 12, lineHeight: 16 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  delta: { width: 44, borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
  deltaUp: { backgroundColor: '#e2f6ee' },
  deltaDown: { backgroundColor: '#fdeaea' },
  deltaText: { fontWeight: '800', fontSize: 13 },
  histInfo: { flex: 1, gap: 1 },
  histReason: { color: '#0b1727', fontWeight: '600', fontSize: 13 },
  histDate: { color: '#98a2b3', fontSize: 11 },
  empty: { color: '#98a2b3' },
});
