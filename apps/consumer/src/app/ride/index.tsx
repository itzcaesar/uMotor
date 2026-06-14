import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  ACTIVITY_LABELS,
  colors,
  ecoScore,
  formatDistance,
  formatDuration,
  formatSpeed,
  type Motorcycle,
  type Ride,
} from '@umotor/shared';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { RouteMap } from '@/components/RouteMap';
import { useRide } from '@/lib/tracking';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function RideHome() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  // Narrow selectors so live points only re-render <LivePanel>, not this list.
  const status = useRide((s) => s.status);
  const error = useRide((s) => s.error);
  const startGps = useRide((s) => s.startGps);
  const startSimulated = useRide((s) => s.startSimulated);
  const stop = useRide((s) => s.stop);
  const [bikeId, setBikeId] = useState<string | null>(null);

  const bikes = useQuery({
    queryKey: ['garage', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Motorcycle[]> => {
      const { data, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Motorcycle[];
    },
  });

  const rides = useQuery({
    queryKey: ['rides', userId],
    enabled: !!userId,
    refetchInterval: 15_000, // realtime fallback (rides is published, but be safe)
    queryFn: async (): Promise<Ride[]> => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('user_id', userId!)
        .order('started_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Ride[];
    },
  });

  // Default the picker to the first bike once loaded.
  useEffect(() => {
    if (!bikeId && bikes.data?.length) setBikeId(bikes.data[0].id);
  }, [bikes.data, bikeId]);

  const selected = bikes.data?.find((b) => b.id === bikeId) ?? bikes.data?.[0];
  const active = status === 'active' || status === 'saving';

  const onStop = async () => {
    const id = await stop();
    qc.invalidateQueries({ queryKey: ['rides', userId] });
    qc.invalidateQueries({ queryKey: ['garage', userId] });
    if (id) router.push({ pathname: '/ride/[id]', params: { id } });
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      {active ? (
        <LivePanel onStop={onStop} saving={status === 'saving'} />
      ) : (
        <Card style={styles.startCard}>
          <Text style={styles.h2}>Mulai melacak perjalanan</Text>
          <Text style={styles.sub}>
            GPS merekam rute, jarak, dan kecepatan. Jarak divalidasi di server —
            odometer & jadwal servis ikut terupdate otomatis.
          </Text>

          {bikes.data && bikes.data.length > 1 && (
            <View style={styles.bikeRow}>
              {bikes.data.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setBikeId(b.id)}
                  style={[styles.bikeChip, b.id === selected?.id && styles.bikeChipOn]}
                >
                  <Text style={[styles.bikeChipText, b.id === selected?.id && styles.bikeChipTextOn]}>
                    {b.model}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            style={[styles.btn, styles.btnPrimary, !selected && styles.btnDisabled]}
            disabled={!selected}
            onPress={() => selected && startGps(selected.id)}
          >
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Mulai Ride (GPS)</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnGhost, !selected && styles.btnDisabled]}
            disabled={!selected}
            onPress={() => selected && startSimulated(selected.id)}
          >
            <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.btnGhostText}>Simulasi ride (demo)</Text>
          </Pressable>

          {error && <Text style={styles.err}>{error}</Text>}
        </Card>
      )}

      <Text style={styles.sectionTitle}>Riwayat ride</Text>
      {rides.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : rides.data && rides.data.length > 0 ? (
        rides.data.map((it) => <RideRow key={it.id} ride={it} />)
      ) : (
        <Text style={styles.empty}>Belum ada ride. Mulai yang pertama di atas.</Text>
      )}
    </ScrollView>
  );
}

function LivePanel({ onStop, saving }: { onStop: () => void; saving: boolean }) {
  const { distanceM, durationS, speedKmh, maxKmh, activity, harshEvents, path, source, flagged } =
    useRide();
  return (
    <Card style={styles.live}>
      <View style={styles.liveHead}>
        <View style={styles.liveDot} />
        <Text style={styles.liveLabel}>
          {source === 'simulated' ? 'SIMULASI BERJALAN' : 'MEREKAM'} · {ACTIVITY_LABELS[activity]}
        </Text>
      </View>

      <RouteMap coords={path} height={200} live style={{ marginTop: 12 }} />

      <View style={styles.statGrid}>
        <Stat big label="Jarak" value={formatDistance(distanceM)} />
        <Stat big label="Durasi" value={formatDuration(durationS)} />
      </View>
      <View style={styles.statGrid}>
        <Stat label="Kecepatan" value={formatSpeed(speedKmh)} />
        <Stat label="Maks" value={formatSpeed(maxKmh)} />
        <Stat label="Skor eco" value={String(ecoScore(harshEvents))} />
      </View>

      {flagged && (
        <Text style={styles.warn}>⚠ Lokasi palsu terdeteksi — ride ini tidak akan dapat poin.</Text>
      )}

      <Pressable style={[styles.btn, styles.btnStop]} onPress={onStop} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="stop" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Selesai & simpan</Text>
          </>
        )}
      </Pressable>
    </Card>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, big && styles.statValueBig]}>{value}</Text>
    </View>
  );
}

function RideRow({ ride }: { ride: Ride }) {
  const date = new Date(ride.started_at).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const discarded = ride.status === 'discarded';
  return (
    <Pressable onPress={() => router.push({ pathname: '/ride/[id]', params: { id: ride.id } })}>
      <Card style={styles.row}>
        <View style={[styles.rowIcon, discarded && { backgroundColor: '#f1f3f7' }]}>
          <Ionicons
            name={ride.flagged ? 'warning' : 'navigate'}
            size={18}
            color={ride.flagged ? colors.danger : colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {formatDistance(ride.distance_m)} · {formatDuration(ride.duration_s)}
          </Text>
          <Text style={styles.rowSub}>
            {date}
            {ride.source === 'simulated' ? ' · simulasi' : ''}
            {discarded ? ' · terlalu pendek' : ''}
            {ride.flagged ? ' · ditandai' : ''}
          </Text>
        </View>
        {ride.eco_score != null && !discarded && (
          <View style={styles.ecoPill}>
            <Text style={styles.ecoText}>eco {ride.eco_score}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color="#c2cad6" />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  h2: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  sub: { color: '#667085', fontSize: 13, lineHeight: 18, marginTop: 4 },
  startCard: { gap: 12 },
  bikeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bikeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f3f6fb',
  },
  bikeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  bikeChipText: { color: '#475467', fontWeight: '700', fontSize: 13 },
  bikeChipTextOn: { color: '#fff' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { borderWidth: 1.5, borderColor: '#cfdcf2', backgroundColor: '#fff' },
  btnGhostText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  btnStop: { backgroundColor: colors.danger, marginTop: 14 },
  btnDisabled: { opacity: 0.5 },
  err: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  // live
  live: { gap: 0 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  liveLabel: { fontWeight: '800', color: colors.danger, fontSize: 12, letterSpacing: 0.5 },
  statGrid: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stat: { flex: 1, gap: 2 },
  statLabel: { color: '#98a2b3', fontSize: 12 },
  statValue: { color: '#0b1727', fontWeight: '800', fontSize: 16 },
  statValueBig: { fontSize: 26 },
  warn: { color: colors.danger, fontSize: 12, marginTop: 12, fontWeight: '600' },
  // history
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 8 },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  rowSub: { color: '#667085', fontSize: 12, marginTop: 2 },
  ecoPill: { backgroundColor: '#e7f7ef', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  ecoText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
});
