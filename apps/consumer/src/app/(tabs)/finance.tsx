import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  estimateOdometer,
  formatRp,
  type Motorcycle,
} from '@umotor/shared';
import { payAstraPaySmart } from '@/lib/astrapay';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { notify } from '@/lib/dialog';
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
  const r = useResponsive();

  const data = useQuery({
    queryKey: ['finance', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 25_000,
    queryFn: async () => {
      const [bills, bikes, spend, user] = await Promise.all([
        supabase.from('bills').select('*').eq('user_id', userId!).order('paid').order('due_date'),
        supabase.from('motorcycles').select('*').eq('user_id', userId!).order('created_at'),
        supabase
          .from('payments')
          .select('amount')
          .eq('user_id', userId!)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from('users').select('astrapay_balance').eq('id', userId!).single(),
      ]);
      return {
        bills: (bills.data ?? []) as Bill[],
        bikes: (bikes.data ?? []) as Motorcycle[],
        monthSpend: (spend.data ?? []).reduce((s, p) => s + (p.amount as number), 0),
        balance: (user.data as { astrapay_balance: number } | null)?.astrapay_balance ?? 0,
      };
    },
  });

  const bikes = data.data?.bikes ?? [];
  const selectedBike = bikes.find((b) => b.id === fuelBike) ?? bikes[0];
  const fuelAmount = liters * FUEL_PRICE_PER_L;
  const estKm = selectedBike ? estimateOdometer(liters, Number(selectedBike.avg_consumption_kml)) : 0;

  // Vehicle tax (STNK) gets its own prominent section; the rest list below.
  // Within each group unpaid leads, paid collapses under.
  const { taxBills, unpaid, paid, dueTotal, unpaidCount } = useMemo(() => {
    const all = data.data?.bills ?? [];
    const allUnpaid = all.filter((b) => !b.paid);
    const others = all.filter((b) => b.type !== 'stnk');
    const otherUnpaid = others.filter((b) => !b.paid);
    return {
      taxBills: all.filter((b) => b.type === 'stnk'),
      unpaid: otherUnpaid,
      paid: others.filter((b) => b.paid),
      dueTotal: allUnpaid.reduce((s, b) => s + b.amount, 0),
      unpaidCount: allUnpaid.length,
    };
  }, [data.data?.bills]);

  // STNK & cicilan open a detail/receipt screen with the full cost breakdown,
  // where the actual AstraPay payment is confirmed. Fuel top-up stays inline below.
  const openBill = (bill: Bill) => router.push(`/finance/bill/${bill.id}`);

  // The proposal's organic odometer trick (Modul 5): fuel top-up nudges the
  // odometer via liters × avg consumption — no manual input.
  const topUpFuel = async () => {
    if (!userId || !selectedBike || busy) return;
    setBusy('fuel');
    try {
      const res = await payAstraPaySmart(fuelAmount, `Top-up BBM ${selectedBike.plate}`, { userId });
      const [pay, odo, user] = await Promise.all([
        supabase.from('payments').insert({
          user_id: userId,
          type: 'bill',
          amount: fuelAmount,
          astrapay_ref: res.ref ?? res.txId,
          astrapay_partner_ref: res.partnerRef ?? null,
        }),
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
      notify(
        'BBM terisi',
        `Odometer ${selectedBike.plate} diperbarui otomatis +${estKm} km (${liters} L × ${selectedBike.avg_consumption_kml} km/L). Cek health bar di Garasi.`,
      );
    } catch (e) {
      notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(null);
    }
  };

  const loading = data.isLoading;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      {/* Wallet + monthly summary */}
      <Card style={styles.summary}>
        <Text style={styles.summaryLabel}>Saldo AstraPay</Text>
        <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {data.data ? formatRp(data.data.balance) : '…'}
        </Text>
        <View style={styles.summarySpendRow}>
          <Text style={styles.summarySpendLabel}>Pengeluaran bulan ini</Text>
          <Text style={styles.summarySpendValue} numberOfLines={1}>
            {data.data ? formatRp(data.data.monthSpend) : '…'}
          </Text>
        </View>
        <Text style={styles.summaryHint}>Semua tagihan motor dalam satu dashboard AstraPay.</Text>
      </Card>

      {/* Upcoming bills summary */}
      {unpaidCount > 0 && (
        <Card style={styles.dueCard}>
          <View style={styles.dueIcon}>
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
          </View>
          <View style={styles.dueInfo}>
            <Text style={styles.dueTitle}>{unpaidCount} tagihan belum dibayar</Text>
            <Text style={styles.dueSub}>Total {formatRp(dueTotal)} menunggu pembayaran</Text>
          </View>
        </Card>
      )}

      {/* Vehicle tax (STNK) — paid straight from AstraPay */}
      {taxBills.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pajak & STNK</Text>
          {taxBills.map((bill) => (
            <TaxCard key={bill.id} bill={bill} onOpen={openBill} />
          ))}
        </>
      )}

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
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Memuat tagihan…</Text>
        </View>
      )}
      {unpaid.map((bill) => (
        <BillCard key={bill.id} bill={bill} onOpen={openBill} />
      ))}

      {paid.length > 0 && (
        <>
          <Text style={styles.subSectionTitle}>Sudah lunas</Text>
          {paid.map((bill) => (
            <BillCard key={bill.id} bill={bill} onOpen={openBill} />
          ))}
        </>
      )}

      {!loading && data.data?.bills.length === 0 && (
        <Text style={styles.empty}>Tidak ada tagihan.</Text>
      )}

      {/* Cross-sell into MotoScore financial products */}
      <Pressable onPress={() => router.push('/motoscore')}>
        <Card style={styles.productLink}>
          <View style={styles.productIcon}>
            <Ionicons name="trending-up" size={20} color="#fff" />
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productTitle}>Produk finansial dari MotoScore</Text>
            <Text style={styles.productDesc}>
              Pinjaman, asuransi, dan cicilan 0% yang terbuka dari skor perawatanmu.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#98a2b3" />
        </Card>
      </Pressable>
    </ScrollView>
  );
}

function TaxCard({ bill, onOpen }: { bill: Bill; onOpen: (bill: Bill) => void }) {
  const daysLeft = Math.ceil((new Date(bill.due_date).getTime() - Date.now()) / 86400000);
  const urgent = !bill.paid && daysLeft <= 30;
  const dueLabel = new Date(bill.due_date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return (
    <Pressable onPress={() => onOpen(bill)}>
      <Card style={[styles.taxCard, bill.paid && styles.taxCardPaid]}>
        <View style={styles.taxTop}>
          <View style={[styles.taxIcon, bill.paid && styles.taxIconPaid]}>
            <Ionicons
              name={bill.paid ? 'shield-checkmark' : 'document-text'}
              size={20}
              color={bill.paid ? colors.accent : colors.primary}
            />
          </View>
          <View style={styles.taxInfo}>
            <Text style={styles.taxName}>{bill.name}</Text>
            {bill.paid ? (
              <Text style={styles.taxPaid}>Lunas tahun ini</Text>
            ) : (
              <Text style={[styles.taxDue, urgent && styles.taxUrgent]}>
                Jatuh tempo {dueLabel}
                {urgent ? ` · ${daysLeft} hari lagi` : ''}
              </Text>
            )}
          </View>
          <Text style={styles.taxAmount}>{formatRp(bill.amount)}</Text>
        </View>
        <View style={[styles.taxBtn, bill.paid && styles.taxBtnGhost]}>
          <Ionicons
            name={bill.paid ? 'receipt-outline' : 'wallet'}
            size={16}
            color={bill.paid ? colors.primary : '#fff'}
          />
          <Text style={[styles.taxBtnText, bill.paid && styles.taxBtnTextGhost]}>
            {bill.paid ? 'Lihat rincian' : 'Lihat rincian & bayar'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function BillCard({ bill, onOpen }: { bill: Bill; onOpen: (bill: Bill) => void }) {
  const daysLeft = Math.ceil((new Date(bill.due_date).getTime() - Date.now()) / 86400000);
  const urgent = !bill.paid && daysLeft <= 14;
  return (
    <Pressable onPress={() => onOpen(bill)}>
      <Card style={styles.billRow}>
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
          <Ionicons name="chevron-forward" size={18} color="#c2cad6" />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  summary: { backgroundColor: colors.primary, borderColor: colors.primary, gap: 4 },
  summaryLabel: { color: '#cfe0f7', fontSize: 12, fontWeight: '600' },
  summaryValue: { color: '#fff', fontSize: 30, fontWeight: '800' },
  summarySpendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a5fb0',
    gap: 12,
  },
  summarySpendLabel: { color: '#cfe0f7', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  summarySpendValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  summaryHint: { color: '#9fc0ec', fontSize: 11, marginTop: 8 },
  dueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff8ec',
    borderColor: '#f6e2bf',
  },
  dueIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fdeecd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueInfo: { flex: 1, gap: 2 },
  dueTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  dueSub: { color: '#8a6d3b', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  subSectionTitle: { fontSize: 13, fontWeight: '700', color: '#667085', marginTop: 4 },
  taxCard: { gap: 12, borderColor: '#dbe7fa' },
  taxCardPaid: { borderColor: '#b5e9d4', backgroundColor: '#f4fbf7' },
  taxTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  taxIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxIconPaid: { backgroundColor: '#e2f6ee' },
  taxInfo: { flex: 1, gap: 2 },
  taxName: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  taxDue: { color: '#667085', fontSize: 12 },
  taxUrgent: { color: colors.warning, fontWeight: '700' },
  taxPaid: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  taxAmount: { fontWeight: '800', color: '#0b1727', fontSize: 15 },
  taxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
  },
  taxBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  taxBtnGhost: { backgroundColor: '#eef4fd' },
  taxBtnTextGhost: { color: colors.primary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: '#667085', fontSize: 13 },
  productLink: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: { flex: 1, gap: 2 },
  productTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  productDesc: { color: '#667085', fontSize: 12, lineHeight: 16 },
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
