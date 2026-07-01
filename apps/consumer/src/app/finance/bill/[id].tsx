import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp } from '@umotor/shared';
import { umotor, useResponsive } from '@/components/ui';
import { PaymentOverlay, usePayment } from '@/components/PaymentOverlay';
import { notify } from '@/lib/dialog';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Bill {
  id: string;
  type: 'stnk' | 'fuel' | 'installment';
  name: string;
  amount: number;
  due_date: string;
  paid: boolean;
  motorcycle_id: string | null;
}
type Bike = { plate: string; brand: string; model: string; year: number };

const TYPE_META: Record<Bill['type'], { icon: keyof typeof Ionicons.glyphMap; label: string; payLabel: string }> = {
  stnk: { icon: 'document-text', label: 'Pajak Kendaraan (STNK)', payLabel: 'Bayar pajak via AstraPay' },
  installment: { icon: 'card', label: 'Cicilan kendaraan', payLabel: 'Bayar cicilan via AstraPay' },
  fuel: { icon: 'water', label: 'Bahan bakar', payLabel: 'Bayar via AstraPay' },
};

// Deterministic line-item breakdown (schema stores a single amount).
function breakdown(bill: Bill): { code: string; desc: string; amount: number }[] {
  if (bill.type === 'stnk') {
    const swdkllj = 35000;
    const admin = 25000;
    const pkb = Math.max(0, bill.amount - swdkllj - admin);
    return [
      { code: 'PKB', desc: 'Pajak Kendaraan Bermotor', amount: pkb },
      { code: 'SWDKLLJ', desc: 'Asuransi Jasa Raharja', amount: swdkllj },
      { code: 'Biaya Administrasi', desc: 'Pengesahan STNK', amount: admin },
    ];
  }
  if (bill.type === 'installment') {
    const admin = 5000;
    const bunga = Math.round((bill.amount - admin) * 0.12);
    const pokok = bill.amount - admin - bunga;
    return [
      { code: 'Pokok angsuran', desc: 'Cicilan bulan ini', amount: pokok },
      { code: 'Bunga', desc: 'Flat per bulan', amount: bunga },
      { code: 'Biaya Administrasi', desc: 'Biaya admin', amount: admin },
    ];
  }
  return [{ code: bill.name, desc: 'Pembelian BBM', amount: bill.amount }];
}

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const { stage, pay: payAstra, clear, busy } = usePayment();

  const q = useQuery({
    queryKey: ['bill', id],
    enabled: !!userId && !!id,
    queryFn: async () => {
      const { data: bill } = await supabase
        .from('bills')
        .select('id, type, name, amount, due_date, paid, motorcycle_id')
        .eq('id', id)
        .single();
      if (!bill) return { bill: null as Bill | null, bike: null as Bike | null, balance: 0 };
      const b = bill as Bill;
      const [bikeRes, userRes] = await Promise.all([
        b.motorcycle_id
          ? supabase.from('motorcycles').select('plate, brand, model, year').eq('id', b.motorcycle_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('users').select('astrapay_balance').eq('id', userId!).single(),
      ]);
      return {
        bill: b,
        bike: (bikeRes.data as Bike | null) ?? null,
        balance: (userRes.data as { astrapay_balance: number } | null)?.astrapay_balance ?? 0,
      };
    },
  });

  const bill = q.data?.bill ?? null;
  const bike = q.data?.bike ?? null;

  const pay = async () => {
    if (!userId || !bill || busy) return;
    try {
      const res = await payAstra(bill.amount, bill.name, { userId });
      // Mark the bill paid + record the payment + decrement the wallet in one
      // atomic transaction (spend_wallet marks the bill via p_bill_id).
      const { error: spendErr } = await supabase.rpc('spend_wallet', {
        p_user_id: userId,
        p_type: 'bill',
        p_amount: bill.amount,
        p_astrapay_ref: res.ref ?? res.txId,
        p_astrapay_partner_ref: res.partnerRef ?? null,
        p_bill_id: bill.id,
      });
      if (spendErr) throw spendErr;
      qc.invalidateQueries({ queryKey: ['finance', userId] });
      qc.invalidateQueries({ queryKey: ['bill', id] });
      clear();
      notify('Pembayaran berhasil', `${bill.name} sudah lunas via AstraPay.`, () => safeBack('/(tabs)/finance'));
    } catch (e) {
      clear();
      notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    }
  };

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={umotor.primary} />
        <Text style={styles.muted}>Memuat tagihan…</Text>
      </View>
    );
  }
  if (!bill) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={40} color="#cbd5e1" />
        <Text style={styles.muted}>Tagihan tidak ditemukan.</Text>
        <Pressable style={styles.fallbackBtn} onPress={() => router.replace('/(tabs)/finance')}>
          <Text style={styles.fallbackText}>Kembali ke Finance</Text>
        </Pressable>
      </View>
    );
  }

  const meta = TYPE_META[bill.type];
  const items = breakdown(bill);
  const dueLabel = new Date(bill.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const title = bike?.plate ?? bill.name;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)/finance')} hitSlop={10} accessibilityLabel="Kembali">
          <Ionicons name="chevron-back" size={25} color={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Detail Tagihan</Text>
      </View>

      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: 17, paddingTop: 40, paddingBottom: insets.bottom + 130 }, r.isTablet && styles.wide]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header card: badge + plate + navy amount band ── */}
        <View style={styles.headCard}>
          <View style={styles.badge}>
            <Ionicons name={bill.paid ? 'shield-checkmark' : meta.icon} size={36} color={umotor.heroDark} />
          </View>
          <Text style={styles.billType}>{meta.label}</Text>
          <Text style={styles.billTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.amountBand}>
            <Text style={styles.amountValue}>{formatRp(bill.amount)}</Text>
            <Text style={styles.amountDue}>{bill.paid ? 'Sudah lunas' : `Jatuh tempo pada ${dueLabel}`}</Text>
          </View>
        </View>

        {/* ── Informasi Tagihan ── */}
        <Text style={styles.section}>Informasi Tagihan</Text>
        <View style={styles.card}>
          {bike && <InfoRow label="Kendaraan" value={`${bike.brand} ${bike.model}`} />}
          {bike && <InfoRow label="Plat nomor" value={bike.plate} />}
          {bill.type === 'stnk' && <InfoRow label="Masa berlaku" value={dueLabel} />}
          <InfoRow label="Jatuh tempo" value={dueLabel} />
          <InfoRow label="Status" value={bill.paid ? 'Lunas' : 'Belum dibayar'} last />
        </View>

        {/* ── Rincian biaya ── */}
        <Text style={styles.section}>Rincian biaya</Text>
        <View style={styles.card}>
          {items.map((it) => (
            <View key={it.code} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineCode}>{it.code}</Text>
                <Text style={styles.lineDesc}>{it.desc}</Text>
              </View>
              <Text style={styles.lineAmount}>{formatRp(it.amount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatRp(bill.amount)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 10) }]}>
        <View style={styles.footerTop}>
          <Text style={styles.footerLabel}>Total Bayar</Text>
          <Text style={styles.footerValue}>{formatRp(bill.amount)}</Text>
        </View>
        {bill.paid ? (
          <View style={[styles.payBtn, styles.payBtnPaid]}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Tagihan lunas</Text>
          </View>
        ) : (
          <Pressable style={[styles.payBtn, busy && styles.payBtnBusy]} onPress={pay} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="wallet" size={18} color="#fff" />
                <Text style={styles.payBtnText}>{meta.payLabel}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <PaymentOverlay stage={stage} amount={bill.amount} />
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: umotor.bg },
  muted: { color: umotor.faint, fontSize: 14 },
  fallbackBtn: { marginTop: 8, backgroundColor: umotor.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  fallbackText: { color: '#fff', fontWeight: '700' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  wide: { maxWidth: 520, width: '100%', alignSelf: 'center' },

  headCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'center', paddingTop: 44, paddingBottom: 0, paddingHorizontal: 16 },
  badge: { position: 'absolute', top: -36, width: 72, height: 72, borderRadius: 36, backgroundColor: '#cce1ff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: umotor.bg },
  billType: { fontSize: 10, fontWeight: '500', color: 'rgba(0,0,0,0.45)' },
  billTitle: { fontSize: 32, fontWeight: '800', color: 'rgba(0,0,0,0.79)', marginTop: 6, marginBottom: 16 },
  amountBand: { alignSelf: 'stretch', backgroundColor: umotor.heroDark, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginHorizontal: -16, marginBottom: -1 },
  amountValue: { fontSize: 36, fontWeight: '800', color: '#fff' },
  amountDue: { fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.58)', marginTop: 6 },

  section: { fontSize: 16, fontWeight: '800', color: umotor.heroDark, marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eef2f8', gap: 12 },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: 'rgba(0,0,0,0.51)', fontSize: 13, fontWeight: '500' },
  infoValue: { color: '#000', fontSize: 13, fontWeight: '500', flexShrink: 1, textAlign: 'right' },

  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  lineCode: { color: '#000', fontSize: 13, fontWeight: '500' },
  lineDesc: { color: 'rgba(0,0,0,0.51)', fontSize: 13, fontWeight: '500', marginTop: 4 },
  lineAmount: { color: '#000', fontSize: 13, fontWeight: '500' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#eef2f8' },
  totalLabel: { color: '#000', fontSize: 20, fontWeight: '500' },
  totalValue: { color: umotor.heroDark, fontSize: 20, fontWeight: '800' },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', paddingHorizontal: 17, paddingTop: 12, gap: 10, boxShadow: '0px -3px 11px rgba(0,0,0,0.1)' },
  footerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLabel: { color: 'rgba(0,0,0,0.44)', fontSize: 12, fontWeight: '500' },
  footerValue: { color: umotor.heroDark, fontSize: 16, fontWeight: '800' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#256bcd', borderRadius: 10, height: 45 },
  payBtnPaid: { backgroundColor: '#4ecb9b' },
  payBtnBusy: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
