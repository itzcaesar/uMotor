import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { estimateOdometer, formatRp, type Motorcycle } from '@umotor/shared';
import { umotor, useResponsive } from '@/components/ui';
import { payAstraPaySmart } from '@/lib/astrapay';
import { notify } from '@/lib/dialog';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const backIcon = require('../../assets/figma/ic-back.png');

const BRANDS = [
  { brand: 'Pertamina', types: [
    { name: 'Pertamax', price: 16000 },
    { name: 'Pertalite', price: 10000 },
    { name: 'Pertamax TURBO', price: 17000 },
  ] },
  { brand: 'Shell', types: [
    { name: 'Shell Super', price: 16000 },
    { name: 'Shell V-Power', price: 17000 },
    { name: 'Shell V-Power Nitro+', price: 18000 },
  ] },
];
const LITERS = [1, 2, 3];

export default function Bbm() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [bi, setBi] = useState(0);
  const [ti, setTi] = useState(0);
  const [liters, setLiters] = useState(2);
  const [bikeIdx, setBikeIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const bikesQ = useQuery({
    queryKey: ['bbm-bikes', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('motorcycles').select('*').eq('user_id', userId!).order('created_at');
      return (data ?? []) as Motorcycle[];
    },
  });

  const bikes = bikesQ.data ?? [];
  const bike = bikes[bikeIdx] ?? bikes[0];
  const type = BRANDS[bi].types[ti] ?? BRANDS[bi].types[0];
  const total = liters * type.price;
  const estKm = bike ? estimateOdometer(liters, Number(bike.avg_consumption_kml)) : 0;

  const topUp = async () => {
    if (!userId || !bike || busy) return;
    setBusy(true);
    try {
      const res = await payAstraPaySmart(total, `Top-up BBM ${bike.plate}`, { userId });
      const [pay, odo, u] = await Promise.all([
        supabase.from('payments').insert({
          user_id: userId,
          type: 'bill',
          amount: total,
          astrapay_ref: res.ref ?? res.txId,
          astrapay_partner_ref: res.partnerRef ?? null,
        }),
        supabase.rpc('advance_odometer', { p_motorcycle_id: bike.id, p_km: estKm }),
        supabase.from('users').select('astrapay_balance').eq('id', userId).single(),
      ]);
      if (pay.error || odo.error) throw pay.error ?? odo.error;
      if (u.data) {
        await supabase.from('users').update({ astrapay_balance: Math.max(0, u.data.astrapay_balance - total) }).eq('id', userId);
      }
      qc.invalidateQueries();
      notify(
        'BBM terisi',
        `Odometer ${bike.plate} +${estKm} km otomatis (${liters} L × ${bike.avg_consumption_kml} km/L). Cek health bar di Garasi.`,
        () => safeBack('/(tabs)'),
      );
    } catch (e) {
      notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Top Up BBM</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 23, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        {/* bike target */}
        {bike && (
          <Pressable
            style={styles.bikeRow}
            onPress={() => bikes.length > 1 && setBikeIdx((bikeIdx + 1) % bikes.length)}
            disabled={bikes.length <= 1}
          >
            <Ionicons name="bicycle" size={18} color={umotor.heroDark} />
            <Text style={styles.bikeText}>Isi untuk {bike.brand} {bike.model} · {bike.plate}</Text>
            {bikes.length > 1 && <Ionicons name="swap-horizontal" size={16} color={umotor.sub} />}
          </Pressable>
        )}

        {BRANDS.map((b, bIdx) => (
          <View key={b.brand} style={{ marginTop: 18 }}>
            <Text style={styles.brand}>{b.brand}</Text>
            <View style={styles.chips}>
              {b.types.map((t, tIdx) => {
                const active = bIdx === bi && tIdx === ti;
                return (
                  <Pressable key={t.name} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]} onPress={() => { setBi(bIdx); setTi(tIdx); }}>
                    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]} numberOfLines={1}>{t.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.literRow}>
              {LITERS.map((L) => {
                const active = bIdx === bi && L === liters;
                const price = b.types[Math.min(ti, b.types.length - 1)].price;
                return (
                  <Pressable
                    key={L}
                    style={[styles.literCard, active ? styles.literActive : styles.literIdle]}
                    onPress={() => { setBi(bIdx); setLiters(L); }}
                  >
                    <Text style={[styles.literNum, { color: active ? umotor.heroDark : 'rgba(28,78,147,0.64)' }]}>{L} L</Text>
                    <Text style={[styles.literPrice, { color: active ? umotor.heroDark : 'rgba(28,78,147,0.64)' }]}>{formatRp(L * price)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Total bar */}
      <View style={[styles.totalBar, { bottom: insets.bottom + 16, opacity: busy ? 0.7 : 1 }]}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatRp(total)}</Text>
        </View>
        <Pressable style={styles.payArrow} onPress={topUp} disabled={busy} accessibilityRole="button" accessibilityLabel={`Bayar ${formatRp(total)}`}>
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-forward" size={20} color={umotor.heroDark} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },

  bikeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, padding: 13, marginTop: 6, borderWidth: 1, borderColor: umotor.line },
  bikeText: { flex: 1, fontSize: 13, fontWeight: '600', color: umotor.ink },

  brand: { fontSize: 18, fontWeight: '500', color: umotor.heroDark, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  chip: { height: 26, borderRadius: 30, paddingHorizontal: 14, justifyContent: 'center' },
  chipActive: { backgroundColor: '#418df6' },
  chipIdle: { backgroundColor: '#fff' },
  chipText: { fontSize: 10, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  chipTextIdle: { color: 'rgba(28,78,147,0.67)' },

  literRow: { flexDirection: 'row', gap: 14, marginTop: 18 },
  literCard: { flex: 1, height: 110, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 14 },
  literActive: { backgroundColor: '#bdd6fa', borderWidth: 1, borderColor: '#0980ff' },
  literIdle: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.2)' },
  literNum: { fontSize: 36, fontWeight: '800' },
  literPrice: { fontSize: 13, fontWeight: '600' },

  totalBar: {
    position: 'absolute',
    left: 17,
    right: 17,
    height: 64,
    borderRadius: 32,
    backgroundColor: umotor.heroDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
  },
  totalLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 3 },
  payArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
