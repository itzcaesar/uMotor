import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  COMPONENT_LABELS,
  colors,
  formatRp,
  healthColor,
  type ComponentHealth,
  type Motorcycle,
} from '@umotor/shared';
import { Card, HealthBar } from '@/components/ui';
import { supabase } from '@/lib/supabase';

interface ServiceHistory {
  id: string;
  created_at: string;
  total_amount: number | null;
  workshops: { name: string } | null;
  services: { name: string } | null;
}

export default function BikeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const detail = useQuery({
    queryKey: ['bike', id],
    enabled: !!id,
    queryFn: async () => {
      const [bike, health, history] = await Promise.all([
        supabase.from('motorcycles').select('*').eq('id', id!).single(),
        supabase.from('component_health').select('*').eq('motorcycle_id', id!),
        supabase
          .from('bookings')
          .select('id, created_at, total_amount, workshops(name), services(name)')
          .eq('motorcycle_id', id!)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (bike.error) throw bike.error;
      return {
        bike: bike.data as Motorcycle,
        health: (health.data ?? []) as ComponentHealth[],
        history: (history.data ?? []) as unknown as ServiceHistory[],
      };
    },
  });

  const d = detail.data;
  if (!d) {
    return <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Motor tidak ditemukan.'}</Text>;
  }

  const worst = [...d.health].sort((a, b) => b.pct_used - a.pct_used)[0];
  const nextServiceKm = worst ? Math.max(0, worst.interval_km - worst.used_km) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.model}>
            {d.bike.brand} {d.bike.model}
          </Text>
          <Text style={styles.plate}>
            {d.bike.plate} · {d.bike.year}
          </Text>
          <View style={styles.odoRow}>
            <View style={styles.odoBox}>
              <Text style={styles.odoValue}>{d.bike.odometer_km.toLocaleString('id-ID')}</Text>
              <Text style={styles.odoLabel}>km odometer</Text>
            </View>
            <View style={styles.odoBox}>
              <Text style={[styles.odoValue, { color: worst ? healthColor(worst.pct_used) : colors.accent }]}>
                ±{nextServiceKm?.toLocaleString('id-ID') ?? '—'}
              </Text>
              <Text style={styles.odoLabel}>km ke servis berikut</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Kesehatan komponen</Text>
        <Card>
          {d.health
            .slice()
            .sort((a, b) => b.pct_used - a.pct_used)
            .map((h) => (
              <View key={h.id} style={styles.compRow}>
                <HealthBar label={COMPONENT_LABELS[h.type]} pctUsed={h.pct_used} />
                <Text style={styles.compMeta}>
                  {h.used_km.toLocaleString('id-ID')} / {h.interval_km.toLocaleString('id-ID')} km
                </Text>
              </View>
            ))}
        </Card>

        <Text style={styles.sectionTitle}>Riwayat servis</Text>
        <Card>
          {d.history.map((h) => (
            <View key={h.id} style={styles.histRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <View style={styles.histInfo}>
                <Text style={styles.histService}>
                  {h.services?.name ?? 'Servis'} · {h.workshops?.name ?? '—'}
                </Text>
                <Text style={styles.histDate}>
                  {new Date(h.created_at).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Text style={styles.histAmount}>
                {h.total_amount != null ? formatRp(h.total_amount) : ''}
              </Text>
            </View>
          ))}
          {d.history.length === 0 && (
            <Text style={styles.empty}>Belum ada servis tercatat lewat uMotor.</Text>
          )}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.cta}
          onPress={() => router.push({ pathname: '/booking/new', params: { bike: d.bike.id } })}
        >
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.ctaText}>Booking servis</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  model: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  plate: { color: '#667085', marginTop: 2 },
  odoRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  odoBox: {
    flex: 1,
    backgroundColor: '#f3f6fb',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  odoValue: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  odoLabel: { fontSize: 11, color: '#98a2b3' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  compRow: { paddingVertical: 4 },
  compMeta: { fontSize: 11, color: '#98a2b3', marginLeft: 100, marginTop: 2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  histInfo: { flex: 1, gap: 1 },
  histService: { color: '#0b1727', fontWeight: '600', fontSize: 13 },
  histDate: { color: '#98a2b3', fontSize: 11 },
  histAmount: { color: '#667085', fontWeight: '700', fontSize: 13 },
  empty: { color: '#98a2b3' },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
