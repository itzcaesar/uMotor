import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, INSTALL_SERVICE_CODE } from '@umotor/shared';
import { payAstraPaySmart } from '@/lib/astrapay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QtyStepper, tabletContainer, umotor, useResponsive } from '@/components/ui';
import { selectInstallFee, selectTotal, useCart, type CartItem, type DeliveryMode } from '@/lib/cart';
import { notify } from '@/lib/dialog';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const DELIVERY: { mode: DeliveryMode; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'ship', label: 'Kirim ke rumah', hint: 'Dikirim ke alamatmu', icon: 'home-outline' },
  { mode: 'install', label: 'Pasang di bengkel', hint: 'Dipasang saat servis', icon: 'construct-outline' },
];

export default function CartScreen() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const { items, delivery, setQty, remove, setDelivery, clear } = useCart();
  const total = useCart(selectTotal);
  const installFee = useCart(selectInstallFee);
  const [busy, setBusy] = useState(false);

  const cartItems = Object.values(items);
  const empty = cartItems.length === 0;
  const isInstall = delivery === 'install';
  const grandTotal = total + (isInstall ? installFee : 0);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  // "Pasang di bengkel" → create an installation order per seller workshop.
  // Each becomes a confirmed booking that shows up in the partner Sparepart-orders tab.
  const createInstallOrders = async (): Promise<string[]> => {
    const [{ data: svc }, { data: bikes }] = await Promise.all([
      supabase.from('services').select('id').eq('code', INSTALL_SERVICE_CODE).single(),
      supabase.from('motorcycles').select('id').eq('user_id', userId!).order('created_at').limit(1),
    ]);
    const serviceId = (svc as { id: string } | null)?.id;
    const bikeId = (bikes as { id: string }[] | null)?.[0]?.id;
    if (!serviceId || !bikeId) return []; // can't resolve service/bike → nothing to create

    const createdIds: string[] = [];
    const groups = new Map<string, CartItem[]>();
    for (const it of cartItems) {
      const wid = it.part.workshop_id;
      if (!wid) continue; // no seller workshop → can't be installed
      const g = groups.get(wid);
      if (g) g.push(it);
      else groups.set(wid, [it]);
    }

    for (const [workshopId, group] of groups) {
      const sellerTotal = group.reduce(
        (s, it) => s + it.part.price * it.qty + it.part.install_fee,
        0,
      );
      const { data: booking, error: bookingErr } = await supabase
        .from('bookings')
        .insert({
          user_id: userId,
          motorcycle_id: bikeId,
          workshop_id: workshopId,
          slot_id: null,
          service_id: serviceId,
          is_home_service: false,
          status: 'confirmed',
          deposit_amount: sellerTotal, // paid in full now
          total_amount: sellerTotal,
        })
        .select('id')
        .single();
      if (bookingErr) throw bookingErr;
      const newBookingId = (booking as { id: string }).id;
      createdIds.push(newBookingId);
      const { error: partsErr } = await supabase.from('booking_parts').insert(
        group.map((it) => ({
          booking_id: newBookingId,
          sparepart_id: it.part.id,
          qty: it.qty,
          unit_price: it.part.price,
        })),
      );
      if (partsErr) throw partsErr;
    }
    return createdIds;
  };

  const checkout = async () => {
    if (!userId || empty) return;
    setBusy(true);
    let createdIds: string[] = [];
    try {
      // Install mode → create the installation order(s) FIRST, so a real AstraPay
      // debit is never taken for orders that fail to create. If payment then
      // fails, the catch rolls these back.
      if (isInstall) createdIds = await createInstallOrders();

      // AstraPay payment — live SNAP debit when enabled, shared mock otherwise.
      const res = await payAstraPaySmart(grandTotal, 'Pembelian sparepart uMotor', { userId });

      // Record the payment so it shows up as GMV in the Console.
      const { error: payErr } = await supabase.from('payments').insert({
        user_id: userId,
        type: 'sparepart',
        amount: grandTotal,
        astrapay_ref: res.ref ?? res.txId,
        astrapay_partner_ref: res.partnerRef ?? null,
      });
      if (payErr) throw payErr;

      // Decrement the demo wallet so the Profile balance reacts.
      const { data: u } = await supabase
        .from('users')
        .select('astrapay_balance')
        .eq('id', userId)
        .single();
      if (u) {
        await supabase
          .from('users')
          .update({ astrapay_balance: Math.max(0, u.astrapay_balance - grandTotal) })
          .eq('id', userId);
      }

      qc.invalidateQueries();
      clear();
      notify(
        'Pembayaran berhasil',
        (isInstall
          ? 'Pesanan pemasangan dibuat di bengkel penjual. Tunjukkan QR di aplikasi saat datang.'
          : 'Sparepart akan dikirim ke alamatmu. Bukti pembayaran tersimpan di AstraPay.') +
          `\n\nRef AstraPay: ${res.ref ?? res.txId}`,
        () => safeBack('/marketplace'),
      );
    } catch (e) {
      // Payment failed after install order(s) were created → delete them
      // (booking_parts first; the FK has no ON DELETE CASCADE).
      if (createdIds.length) {
        try {
          await supabase.from('booking_parts').delete().in('booking_id', createdIds);
          await supabase.from('bookings').delete().in('id', createdIds);
          qc.invalidateQueries();
        } catch {
          // best-effort rollback
        }
      }
      notify('Gagal', e instanceof Error ? e.message : 'Pembayaran gagal diproses. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable
          onPress={() => safeBack('/marketplace')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Tutup keranjang"
        >
          <Ionicons name="close" size={26} color={umotor.ink} />
        </Pressable>
        <Text style={styles.title}>Keranjang</Text>
        <View style={{ width: 26 }} />
      </View>

      {empty ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cart-outline" size={48} color={umotor.faint} />
          <Text style={styles.empty}>Keranjang masih kosong.</Text>
          <Pressable style={styles.browseBtn} onPress={() => safeBack('/marketplace')}>
            <Text style={styles.browseText}>Lihat sparepart</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]}>
            {cartItems.map(({ part, qty }) => (
              <View key={part.id} style={[styles.card, styles.item]}>
                <View style={styles.itemTop}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{part.name}</Text>
                    <Text style={styles.itemMeta}>{part.brand ?? 'Generic'}</Text>
                    {part.seller_name && (
                      <Text style={styles.itemSeller}>
                        Dijual oleh {part.seller_name}
                      </Text>
                    )}
                    <Text style={styles.itemPrice}>{formatRp(part.price)}</Text>
                    {isInstall && (
                      <Text style={styles.itemInstall}>+ pasang {formatRp(part.install_fee)}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => remove(part.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus ${part.name} dari keranjang`}
                  >
                    <Ionicons name="trash-outline" size={20} color={'#e0543f'} />
                  </Pressable>
                </View>
                <View style={styles.itemBottom}>
                  <QtyStepper qty={qty} onChange={(n) => setQty(part.id, n)} />
                  <Text style={styles.itemSubtotal}>{formatRp(part.price * qty)}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.sectionTitle}>Metode pengiriman</Text>
            <View style={styles.deliveryRow}>
              {DELIVERY.map((d) => {
                const active = delivery === d.mode;
                return (
                  <Pressable
                    key={d.mode}
                    style={[styles.deliveryCard, active && styles.deliveryActive]}
                    onPress={() => setDelivery(d.mode)}
                  >
                    <Ionicons
                      name={d.icon}
                      size={20}
                      color={active ? umotor.primary : umotor.sub}
                    />
                    <Text style={[styles.deliveryLabel, active && styles.deliveryLabelActive]}>
                      {d.label}
                    </Text>
                    <Text style={styles.deliveryHint}>{d.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(28, insets.bottom + 8) }, tabletContainer(r)]}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Subtotal</Text>
              <Text style={styles.breakdownValue}>{formatRp(total)}</Text>
            </View>
            {isInstall && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Biaya pasang di bengkel</Text>
                <Text style={styles.breakdownValue}>{formatRp(installFee)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRp(grandTotal)}</Text>
            </View>
            <Pressable
              style={[styles.payBtn, busy && styles.payBtnBusy]}
              onPress={checkout}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.payText}>Bayar via AstraPay</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: umotor.line,
  },
  title: { fontSize: 17, fontWeight: '800', color: umotor.heroDark },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  item: { gap: 12 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between' },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '700', color: umotor.ink },
  itemMeta: { fontSize: 12, color: umotor.sub },
  itemSeller: { fontSize: 12, color: umotor.sub, marginTop: 2 },
  itemPrice: { marginTop: 2, color: umotor.sub, fontSize: 13 },
  itemInstall: { marginTop: 1, color: '#00a86b', fontSize: 12, fontWeight: '600' },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemSubtotal: { fontWeight: '800', color: umotor.primary, fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: umotor.heroDark, marginTop: 4 },
  deliveryRow: { flexDirection: 'row', gap: 10 },
  deliveryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 4,
    borderWidth: 1.5,
    borderColor: umotor.line,
  },
  deliveryActive: { borderColor: umotor.primary, backgroundColor: umotor.tile },
  deliveryLabel: { fontWeight: '700', color: umotor.sub, fontSize: 13 },
  deliveryLabelActive: { color: umotor.primary },
  deliveryHint: { fontSize: 11, color: umotor.faint },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: umotor.line,
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { color: umotor.sub, fontSize: 14 },
  breakdownValue: { color: umotor.ink, fontSize: 14, fontWeight: '600' },
  totalLabel: { color: umotor.sub, fontWeight: '600' },
  totalValue: { fontSize: 22, fontWeight: '800', color: umotor.ink },
  payBtn: {
    backgroundColor: umotor.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnBusy: { opacity: 0.7 },
  payText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { color: umotor.faint, fontSize: 15 },
  browseBtn: {
    marginTop: 8,
    backgroundColor: umotor.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  browseText: { color: '#fff', fontWeight: '700' },
});
