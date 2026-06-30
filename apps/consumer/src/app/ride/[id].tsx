import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  RIDE_EVENT_LABELS,
  type LatLng,
  type Ride,
  type RideEvent,
} from '@umotor/shared';
import { tabletContainer, umotor, useResponsive } from '@/components/ui';
import { RouteMap } from '@/components/RouteMap';
import { supabase } from '@/lib/supabase';

const CO2_SAVED_KG_PER_KM = 0.12; // motorcycle vs. an equivalent car trip

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useResponsive();

  const q = useQuery({
    queryKey: ['ride', id],
    enabled: !!id,
    queryFn: async () => {
      const [ride, points, events] = await Promise.all([
        supabase.from('rides').select('*').eq('id', id).single(),
        supabase.from('ride_points').select('lat,lng').eq('ride_id', id).order('ts'),
        supabase.from('ride_events').select('*').eq('ride_id', id).order('ts'),
      ]);
      if (ride.error) throw ride.error;
      return {
        ride: ride.data as Ride,
        coords: (points.data ?? []) as LatLng[],
        events: (events.data ?? []) as RideEvent[],
      };
    },
  });

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={umotor.primary} />
      </View>
    );
  }
  if (q.isError || !q.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Gagal memuat ride.</Text>
      </View>
    );
  }

  const { ride, coords, events } = q.data;
  const km = ride.distance_m / 1000;
  const co2 = km * CO2_SAVED_KG_PER_KM;
  const points = ride.status === 'completed' && !ride.flagged ? Math.round(km) * 10 : 0;
  const dateLabel = new Date(ride.started_at).toLocaleString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      <Text style={styles.date}>{dateLabel}</Text>
      <View style={styles.badges}>
        {ride.source === 'simulated' && <Badge text="Simulasi" tone="muted" />}
        {ride.status === 'discarded' && <Badge text="Terlalu pendek" tone="muted" />}
        {ride.flagged && <Badge text="Lokasi palsu" tone="danger" />}
        {ride.status === 'completed' && !ride.flagged && <Badge text="Tervalidasi" tone="ok" />}
      </View>

      <RouteMap coords={coords} height={220} />

      <View style={styles.heroRow}>
        <Hero label="Jarak" value={formatDistance(ride.distance_m)} />
        <Hero label="Durasi" value={formatDuration(ride.duration_s)} />
      </View>

      <View style={[styles.card, styles.statsCard]}>
        <Stat icon="speedometer-outline" label="Kecepatan rata-rata" value={formatSpeed(ride.avg_kmh)} />
        <Stat icon="flash-outline" label="Kecepatan maks" value={formatSpeed(ride.max_kmh)} />
        <Stat
          icon="leaf-outline"
          label="Skor eco"
          value={ride.eco_score != null ? `${ride.eco_score}/100` : '—'}
          tone={'#00a86b'}
        />
        <Stat icon="alert-circle-outline" label="Kejadian agresif" value={String(ride.harsh_events)} />
      </View>

      {points > 0 && (
        <View style={[styles.card, styles.rewardCard]}>
          <Ionicons name="gift" size={22} color={'#00a86b'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rewardTitle}>+{points} MotoPoin</Text>
            <Text style={styles.rewardSub}>
              Odometer +{Math.round(km)} km · jadwal servis ikut diperbarui
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.card, styles.ecoCard]}>
        <Ionicons name="cloud-outline" size={20} color={umotor.primary} />
        <Text style={styles.ecoText}>
          Hemat ±{co2.toLocaleString('id-ID', { maximumFractionDigits: 1 })} kg CO₂ dibanding mobil
        </Text>
      </View>

      {events.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Catatan berkendara</Text>
          {events.map((e) => (
            <View key={e.id} style={[styles.card, styles.eventRow]}>
              <Ionicons name="warning-outline" size={16} color={'#e6b13f'} />
              <Text style={styles.eventText}>{RIDE_EVENT_LABELS[e.type] ?? e.type}</Text>
              <Text style={styles.eventTime}>
                {new Date(e.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Hero({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.card, styles.hero]}>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.heroLabel}>{label}</Text>
    </View>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={tone ?? umotor.primary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function Badge({ text, tone }: { text: string; tone: 'ok' | 'muted' | 'danger' }) {
  const bg = tone === 'ok' ? '#e7f7ef' : tone === 'danger' ? '#fdeaea' : umotor.tile;
  const fg = tone === 'ok' ? '#00a86b' : tone === 'danger' ? '#e0543f' : umotor.primary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: umotor.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: umotor.bg },
  empty: { color: umotor.faint },
  date: { color: umotor.sub, fontWeight: '600', fontSize: 13 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  heroRow: { flexDirection: 'row', gap: 12 },
  hero: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 18 },
  heroValue: { fontSize: 24, fontWeight: '800', color: umotor.heroDark },
  heroLabel: { color: umotor.faint, fontSize: 12 },
  statsCard: { gap: 0 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  statLabel: { flex: 1, color: umotor.sub, fontSize: 14 },
  statValue: { fontWeight: '800', color: umotor.heroDark, fontSize: 15 },
  rewardCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f0fbf5' },
  rewardTitle: { fontWeight: '800', color: '#00a86b', fontSize: 16 },
  rewardSub: { color: '#5b7a6b', fontSize: 12, marginTop: 2 },
  ecoCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ecoText: { color: umotor.sub, fontSize: 13, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: umotor.heroDark, marginTop: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  eventText: { flex: 1, color: umotor.ink, fontSize: 14 },
  eventTime: { color: umotor.faint, fontSize: 12 },
});
