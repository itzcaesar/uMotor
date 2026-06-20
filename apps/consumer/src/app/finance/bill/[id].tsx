import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp } from '@umotor/shared';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { PaymentOverlay, usePayment } from '@/components/PaymentOverlay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const TYPE_META: Record<
  Bill['type'],
  { icon: keyof typeof Ionicons.glyphMap; label: string; payLabel: string }
> = {
  stnk: { icon: 'document-text', label: 'Pajak kendaraan (STNK)', payLabel: 'Bayar pajak via AstraPay' },
  installment: { icon: 'card', label: 'Cicilan kendaraan', payLabel: 'Bayar cicilan via AstraPay' },
  fuel: { icon: 'water', label: 'Bahan bakar', payLabel: 'Bayar via AstraPay' },
};

/**
 * Deterministic line-item breakdown from the bill total. The schema stores only
 * a single `amount`, so the components below are reconstructed to mirror a real
 * Samsat / leasing invoice (and always sum back to the total).
 */
function breakdown(bill: Bill): { label: string; hint?: string; amount: number }[] {
  if (bill.type === 'stnk') {
    const swdkllj = 35000; // Jasa Raharja, fixed for motorcycles
    const admin = 25000; // pengesahan STNK
    const pkb = Math.max(0, bill.amount - swdkllj - admin);
    return [
      { label: 'PKB', hint: 'Pajak Kendaraan Bermotor', amount: pkb },
      { label: 'SWDKLLJ', hint: 'Asuransi Jasa Raharja', amount: swdkllj },
      { label: 'Biaya administrasi', hint: 'Pengesahan STNK', amount: admin },
    ];
  }
  if (bill.type === 'installment') {
    const admin = 5000;
    const bunga = Math.round((bill.amount - admin) * 0.12);
    const pokok = bill.amount - admin - bunga;
    return [
      { label: 'Pokok angsuran', amount: pokok },
      { label: 'Bunga', hint: 'Flat per bulan', amount: bunga },
      { label: 'Biaya admin', amount: admin },
    ];
  }
  return [{ label: bill.name, amount: bill.amount }];
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
  const balance = q.data?.balance ?? 0;

  const pay = async () => {
    if (!userId || !bill || busy) return;
    // The demo wallet clamps at 0 and never blocks a payment (same convention as
    // fuel top-up and the cart) — so a bill larger than the seeded balance, e.g.
    // the Rp 1.150.000 cicilan against a Rp 500.000 wallet, still completes.
    try {
      const res = await payAstra(bill.amount, bill.name, { userId }); // drives the branded overlay
      const [upd, payRes] = await Promise.all([
        supabase.from('bills').update({ paid: true }).eq('id', bill.id),
        supabase.from('payments').insert({
          user_id: userId,
          type: 'bill',
          amount: bill.amount,
          astrapay_ref: res.ref ?? res.txId,
          astrapay_partner_ref: res.partnerRef ?? null,
        }),
      ]);
      if (upd.error || payRes.error) throw upd.error ?? payRes.error;
      await supabase
        .from('users')
        .update({ astrapay_balance: Math.max(0, balance - bill.amount) })
        .eq('id', userId);
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
        <ActivityIndicator color={colors.primary} />
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
  const daysLeft = Math.ceil((new Date(bill.due_date).getTime() - Date.now()) / 86400000);
  const urgent = !bill.paid && daysLeft <= 30;
  const dueLabel = new Date(bill.due_date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const lender = bill.name.includes('—') ? bill.name.split('—').pop()!.trim() : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]}>
        {/* Header */}
        <Card style={[styles.head, bill.paid && styles.headPaid]}>
          <View style={[styles.headIcon, bill.paid && styles.headIconPaid]}>
            <Ionicons
              name={bill.paid ? 'shield-checkmark' : meta.icon}
              size={26}
              color={bill.paid ? colors.accent : colors.primary}
            />
          </View>
          <Text style={styles.headType}>{meta.label}</Text>
          <Text style={styles.headName}>{bill.name}</Text>
          <Text style={styles.headAmount}>{formatRp(bill.amount)}</Text>
          {bill.paid ? (
            <View style={styles.paidPill}>
              <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
              <Text style={styles.paidPillText}>Lunas</Text>
            </View>
          ) : (
            <Text style={[styles.headDue, urgent && styles.urgent]}>
              Jatuh tempo {dueLabel}
              {daysLeft >= 0 ? ` · ${daysLeft} hari lagi` : ' · terlewat'}
            </Text>
          )}
        </Card>

        {/* Bill info */}
        <Text style={styles.sectionTitle}>Informasi tagihan</Text>
        <Card style={styles.infoCard}>
          {bike && <InfoRow label="Kendaraan" value={`${bike.brand} ${bike.model} (${bike.year})`} />}
          {bike && <InfoRow label="Plat nomor" value={bike.plate} />}
          {bill.type === 'stnk' && <InfoRow label="Masa berlaku" value={`s.d. ${dueLabel}`} />}
          {lender && <InfoRow label="Penyedia" value={lender} />}
          <InfoRow label="Jatuh tempo" value={dueLabel} />
          <InfoRow label="Status" value={bill.paid ? 'Lunas' : 'Belum dibayar'} last />
        </Card>

        {/* Breakdown */}
        <Text style={styles.sectionTitle}>Rincian {bill.paid ? 'pembayaran' : 'biaya'}</Text>
        <Card style={styles.infoCard}>
          {items.map((it) => (
            <View key={it.label} style={styles.lineRow}>
              <View style={styles.lineLabelWrap}>
                <Text style={styles.lineLabel}>{it.label}</Text>
                {it.hint && <Text style={styles.lineHint}>{it.hint}</Text>}
              </View>
              <Text style={styles.lineAmount}>{formatRp(it.amount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatRp(bill.amount)}</Text>
          </View>
        </Card>

        {/* Payment method */}
        {!bill.paid && (
          <>
            <Text style={styles.sectionTitle}>Metode pembayaran</Text>
            <Card style={styles.payMethod}>
              <View style={styles.payMethodIcon}>
                <Ionicons name="wallet" size={20} color={colors.primary} />
              </View>
              <View style={styles.payMethodInfo}>
                <Text style={styles.payMethodName}>AstraPay</Text>
                <Text style={styles.payMethodBalance}>Saldo {formatRp(balance)}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            </Card>
          </>
        )}
      </ScrollView>

      {/* Pay action */}
      {!bill.paid && (
        <View style={[styles.footer, { paddingBottom: Math.max(28, insets.bottom + 8) }, tabletContainer(r)]}>
          <View style={styles.footerSummary}>
            <Text style={styles.footerLabel}>Total bayar</Text>
            <Text style={styles.footerValue}>{formatRp(bill.amount)}</Text>
          </View>
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
        </View>
      )}

      <PaymentOverlay stage={stage} amount={bill.amount} />
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  muted: { color: '#98a2b3', fontSize: 14 },
  fallbackBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  fallbackText: { color: '#fff', fontWeight: '700' },
  head: { alignItems: 'center', gap: 4, borderColor: '#dbe7fa' },
  headPaid: { borderColor: '#b5e9d4', backgroundColor: '#f4fbf7' },
  headIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headIconPaid: { backgroundColor: '#e2f6ee' },
  headType: { color: '#667085', fontSize: 12, fontWeight: '600' },
  headName: { color: '#0b1727', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  headAmount: { color: '#0b1727', fontSize: 28, fontWeight: '800', marginTop: 2 },
  headDue: { color: '#667085', fontSize: 13, marginTop: 2 },
  urgent: { color: colors.warning, fontWeight: '700' },
  paidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e2f6ee',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  paidPillText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  infoCard: { gap: 0, paddingVertical: 4 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f6',
    gap: 12,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: '#667085', fontSize: 13 },
  infoValue: { color: '#0b1727', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  lineLabelWrap: { flex: 1, gap: 1 },
  lineLabel: { color: '#344054', fontSize: 14, fontWeight: '600' },
  lineHint: { color: '#98a2b3', fontSize: 11 },
  lineAmount: { color: '#0b1727', fontSize: 14, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
  },
  totalLabel: { color: '#0b1727', fontSize: 15, fontWeight: '800' },
  totalValue: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  payMethod: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payMethodInfo: { flex: 1, gap: 2 },
  payMethodName: { color: '#0b1727', fontSize: 14, fontWeight: '700' },
  payMethodBalance: { color: '#667085', fontSize: 12 },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLabel: { color: '#667085', fontSize: 14, fontWeight: '600' },
  footerValue: { color: '#0b1727', fontSize: 20, fontWeight: '800' },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  payBtnBusy: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
