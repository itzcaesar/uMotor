import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, payAstraPay } from '@umotor/shared';
import { Card, QtyStepper } from '@/components/ui';
import { selectTotal, useCart, type DeliveryMode } from '@/lib/cart';
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
  const [busy, setBusy] = useState(false);

  const cartItems = Object.values(items);
  const empty = cartItems.length === 0;

  const checkout = async () => {
    if (!userId || empty) return;
    setBusy(true);
    try {
      // Fake AstraPay payment (shared mock) — never fails in demo build.
      await payAstraPay(total, 'Pembelian sparepart uMotor');

      // Record the payment so it shows up as GMV in the Console.
      await supabase.from('payments').insert({ user_id: userId, type: 'sparepart', amount: total });

      // Decrement the demo wallet so the Profile balance reacts.
      const { data: u } = await supabase
        .from('users')
        .select('astrapay_balance')
        .eq('id', userId)
        .single();
      if (u) {
        await supabase
          .from('users')
          .update({ astrapay_balance: Math.max(0, u.astrapay_balance - total) })
          .eq('id', userId);
      }

      qc.invalidateQueries({ queryKey: ['profile', userId] });
      clear();
      Alert.alert(
        'Pembayaran berhasil',
        delivery === 'ship'
          ? 'Sparepart akan dikirim ke alamatmu. Bukti pembayaran tersimpan di AstraPay.'
          : 'Sparepart disiapkan untuk dipasang di bengkel saat servis berikutnya.',
        [{ text: 'Selesai', onPress: () => router.back() }],
      );
    } catch {
      Alert.alert('Gagal', 'Pembayaran gagal diproses. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={26} color="#0b1727" />
        </Pressable>
        <Text style={styles.title}>Keranjang</Text>
        <View style={{ width: 26 }} />
      </View>

      {empty ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cart-outline" size={48} color="#cbd5e1" />
          <Text style={styles.empty}>Keranjang masih kosong.</Text>
          <Pressable style={styles.browseBtn} onPress={() => router.back()}>
            <Text style={styles.browseText}>Lihat sparepart</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {cartItems.map(({ part, qty }) => (
              <Card key={part.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{part.name}</Text>
                    <Text style={styles.itemMeta}>{part.brand ?? 'Generic'}</Text>
                    <Text style={styles.itemPrice}>{formatRp(part.price)}</Text>
                  </View>
                  <Pressable onPress={() => remove(part.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
                <View style={styles.itemBottom}>
                  <QtyStepper qty={qty} onChange={(n) => setQty(part.id, n)} />
                  <Text style={styles.itemSubtotal}>{formatRp(part.price * qty)}</Text>
                </View>
              </Card>
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
                      color={active ? colors.primary : '#667085'}
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

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRp(total)}</Text>
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
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e9f0',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0b1727' },
  content: { padding: 16, gap: 12 },
  item: { gap: 12 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between' },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#0b1727' },
  itemMeta: { fontSize: 12, color: '#667085' },
  itemPrice: { marginTop: 2, color: '#667085', fontSize: 13 },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemSubtotal: { fontWeight: '800', color: colors.primary, fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  deliveryRow: { flexDirection: 'row', gap: 10 },
  deliveryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
  },
  deliveryActive: { borderColor: colors.primary, backgroundColor: '#eef4fd' },
  deliveryLabel: { fontWeight: '700', color: '#667085', fontSize: 13 },
  deliveryLabelActive: { color: colors.primary },
  deliveryHint: { fontSize: 11, color: '#98a2b3' },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#667085', fontWeight: '600' },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#0b1727' },
  payBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnBusy: { opacity: 0.7 },
  payText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { color: '#98a2b3', fontSize: 15 },
  browseBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  browseText: { color: '#fff', fontWeight: '700' },
});
