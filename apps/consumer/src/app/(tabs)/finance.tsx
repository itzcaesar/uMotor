import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  estimateOdometer,
  formatRp,
  payAstraPay,
  type Motorcycle,
} from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Bill {
  id: string;
  type: 'stnk' | 'fuel' | 'installment';
  name: string;
  amount: number;
  due_date: string;
  paid: boolean;
}

const BILL_ICONS: Record<Bill['type'], keyof typeof Ionicons.glyphMap> = {
  stnk: 'document-text',
  fuel: 'water',
  installment: 'card',
};

const FUEL_PRICE_PER_L = 13000; // Pertamax, demo price
const LITER_OPTIONS = [1, 2, 3];

export default function FinanceHub() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [fuelBike, setFuelBike] = useState<string | null>(null);
  const [liters, setLiters] = useState(2);

  const data = useQuery({
    queryKey: ['finance', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [bills, bikes, spend] = await Promise.all([
        supabase.from('bills').select('*').eq('user_id', userId!).order('paid').order('due_date'),
        supabase.from('motorcycles').select('*').eq('user_id', userId!).order('created_at'),
        supabase
          .from('payments')
          .select('amount')
          .eq('user_id', userId!)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      return {
        bills: (bills.data ?? []) as Bill[],
        bikes: (bikes.data ?? []) as Motorcycle[],
        monthSpend: (spend.data ?? []).reduce((s, p) => s + (p.amount as number), 0),
      };
    },
  });

  const bikes = data.data?.bikes ?? [];
  const selectedBike = bikes.find((b) => b.id === fuelBike) ?? bikes[0];
  const fuelAmount = liters * FUEL_PRICE_PER_L;
  const estKm = selectedBike ? estimateOdometer(liters, Number(selectedBike.avg_consumption_kml)) : 0;

  const payBill = async (bill: Bill) => {
    if (!userId || busy) return;
    setBusy(bill.id);
    try {
      await payAstraPay(bill.amount, bill.name);
      const [upd, pay, user] = await Promise.all([
        supabase.from('bills').update({ paid: true }).eq('id', bill.id),
        supabase.from('payments').insert({ user_id: userId, type: 'bill', amount: bill.amount }),
        supabase.from('users').select('astrapay_balance').eq('id', userId).single(),
      ]);
      if (upd.error || pay.error) throw upd.error ?? pay.error;
      if (user.data) {
        await supabase
          .from('users')
          .update({ astrapay_balance: Math.max(0, user.data.astrapay_balance - bill.amount) })
          .eq('id', userId);
      }
      qc.invalidateQueries();
      Alert.alert('Lunas', `${bill.name} dibayar via AstraPay.`);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(null);
    }
  };

  // The proposal's organic odometer trick (Modul 5): fuel top-up nudges the
  // odometer via liters × avg consumption — no manual input.
  const topUpFuel = async () => {
    if (!userId || !selectedBike || busy) return;
    setBusy('fuel');
    try {
      await payAstraPay(fuelAmount, `Top-up BBM ${selectedBike.plate}`);
      const [pay, odo, user] = await Promise.all([
        supabase.from('payments').insert({ user_id: userId, type: 'bill', amount: fuelAmount }),
        supabase.rpc('advance_odometer', { p_motorcycle_id: selectedBike.id, p_km: estKm }),
        supabase.from('users').select('astrapay_balance').eq('id', userId).single(),
      ]);
      if (pay.error || odo.error) throw pay.error ?? odo.error;
      if (user.data) {
        await supabase
          .from('users')
          .update({ astrapay_balance: Math.max(0, user.data.astrapay_balance - fuelAmount) })
          .eq('id', userId);
      }
      qc.invalidateQueries();
      Alert.alert(
        'BBM terisi',
        `Odometer ${selectedBike.plate} diperbarui otomatis +${estKm} km (${liters} L × ${selectedBike.avg_consumption_kml} km/L). Cek health bar di Garasi.`,
      );
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Monthly summary */}
      <Card style={styles.summary}>
        <Text style={styles.summaryLabel}>Pengeluaran motor bulan ini</Text>
        <Text style={styles.summaryValue}>
          {data.data ? formatRp(data.data.monthSpend) : '…'}
        </Text>
        <Text style={styles.summaryHint}>Semua tagihan motor dalam satu dashboard AstraPay.</Text>
      </Card>

      {/* Fuel top-up with organic odometer update */}
      <Text style={styles.sectionTitle}>Top-up BBM</Text>
      <Card style={styles.fuelCard}>
        <View style={styles.bikeChips}>
          {bikes.map((b) => {
            const active = b.id === selectedBike?.id;
            return (
              <Pressable
                key={b.id}
                style={[styles.bikeChip, active && styles.bikeChipActive]}
                onPress={() => setFuelBike(b.id)}
              >
                <Text style={[styles.bikeChipText, active && styles.bikeChipTextActive]}>
                  {b.model}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.literRow}>
          {LITER_OPTIONS.map((l) => {
            const active = l === liters;
            return (
              <Pressable
                key={l}
                style={[styles.literBox, active && styles.literActive]}
                onPress={() => setLiters(l)}
              >
                <Text style={[styles.literValue, active && styles.literTextActive]}>{l} L</Text>
                <Text style={[styles.literPrice, active && styles.literTextActive]}>
                  {formatRp(l * FUEL_PRICE_PER_L)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.estRow}>
          <Ionicons name="speedometer-outline" size={14} color={colors.primary} />
          <Text style={styles.estText}>
            Odometer otomatis +{estKm} km — tanpa input manual
          </Text>
        </View>
        <Pressable
          style={[styles.fuelBtn, busy === 'fuel' && styles.btnBusy]}
          onPress={topUpFuel}
          disabled={busy === 'fuel'}
        >
          {busy === 'fuel' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.fuelBtnText}>Bayar {formatRp(fuelAmount)} via AstraPay</Text>
          )}
        </Pressable>
      </Card>

      {/* Bills */}
      <Text style={styles.sectionTitle}>Tagihan</Text>
      {(data.data?.bills ?? []).map((bill) => {
        const daysLeft = Math.ceil(
          (new Date(bill.due_date).getTime() - Date.now()) / 86400000,
        );
        const urgent = !bill.paid && daysLeft <= 14;
        return (
          <Card key={bill.id} style={styles.billRow}>
            <View style={[styles.billIcon, bill.paid && styles.billIconPaid]}>
              <Ionicons
                name={BILL_ICONS[bill.type]}
                size={18}
                color={bill.paid ? colors.accent : colors.primary}
              />
            </View>
            <View style={styles.billInfo}>
              <Text style={styles.billName}>{bill.name}</Text>
              {bill.paid ? (
                <Text style={styles.billPaid}>Lunas</Text>
              ) : (
                <Text style={[styles.billDue, urgent && styles.billUrgent]}>
                  Jatuh tempo{' '}
                  {new Date(bill.due_date).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'long',
                  })}
                  {urgent ? ` · ${daysLeft} hari lagi` : ''}
                </Text>
              )}
            </View>
            <View style={styles.billRight}>
              <Text style={styles.billAmount}>{formatRp(bill.amount)}</Text>
              {!bill.paid && (
                <Pressable
                  style={[styles.payBtn, busy === bill.id && styles.btnBusy]}
                  onPress={() => payBill(bill)}
                  disabled={!!busy}
                >
                  {busy === bill.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.payBtnText}>Bayar</Text>
                  )}
                </Pressable>
              )}
            </View>
          </Card>
        );
      })}
      {data.data?.bills.length === 0 && <Text style={styles.empty}>Tidak ada tagihan.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  summary: { backgroundColor: colors.primary, borderColor: colors.primary, gap: 2 },
  summaryLabel: { color: '#cfe0f7', fontSize: 13, fontWeight: '600' },
  summaryValue: { color: '#fff', fontSize: 30, fontWeight: '800' },
  summaryHint: { color: '#9fc0ec', fontSize: 11, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  fuelCard: { gap: 12 },
  bikeChips: { flexDirection: 'row', gap: 8 },
  bikeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f3f6fb',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  bikeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  bikeChipText: { color: '#667085', fontWeight: '600', fontSize: 13 },
  bikeChipTextActive: { color: '#fff' },
  literRow: { flexDirection: 'row', gap: 10 },
  literBox: {
    flex: 1,
    backgroundColor: '#f3f6fb',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
  },
  literActive: { borderColor: colors.primary, backgroundColor: '#eef4fd' },
  literValue: { fontWeight: '800', color: '#0b1727', fontSize: 16 },
  literPrice: { color: '#98a2b3', fontSize: 11 },
  literTextActive: { color: colors.primary },
  estRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  estText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  fuelBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  fuelBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnBusy: { opacity: 0.6 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  billIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billIconPaid: { backgroundColor: '#e2f6ee' },
  billInfo: { flex: 1, gap: 2 },
  billName: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  billDue: { color: '#667085', fontSize: 12 },
  billUrgent: { color: colors.warning, fontWeight: '700' },
  billPaid: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  billRight: { alignItems: 'flex-end', gap: 6 },
  billAmount: { fontWeight: '800', color: '#0b1727', fontSize: 13 },
  payBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: '#98a2b3', marginTop: 24 },
});
