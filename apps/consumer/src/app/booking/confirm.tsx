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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  DEPOSIT_AMOUNT,
  formatRp,
  payAstraPay,
  type Booking,
  type Motorcycle,
  type Sparepart,
} from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { safeBack } from '@/lib/nav';
import { selectDraftTotal, useDraft } from '@/lib/draft';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Service code → sparepart categories worth recommending (PRD 01 §4.6).
const SERVICE_PARTS: Record<string, string[]> = {
  oil_change: ['oil', 'filter'],
  tune_up: ['oil', 'filter', 'brake'],
  battery_swap: ['battery'],
};

export default function Confirm() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const draft = useDraft();
  const partsTotal = useDraft(selectDraftTotal);
  const [busy, setBusy] = useState(false);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const info = useQuery({
    queryKey: ['confirm-info', draft.motorcycleId],
    enabled: !!draft.motorcycleId && !!userId,
    queryFn: async () => {
      const [bike, balance] = await Promise.all([
        supabase.from('motorcycles').select('*').eq('id', draft.motorcycleId!).single(),
        supabase.from('users').select('astrapay_balance').eq('id', userId!).single(),
      ]);
      const model = (bike.data as Motorcycle | null)?.model;
      const categories = SERVICE_PARTS[draft.service?.code ?? ''] ?? [];
      const { data: recs } = await supabase
        .from('spareparts')
        .select('*')
        .in('category', categories.length ? categories : ['none'])
        .contains('compatible_models', model ? [model] : []);
      return {
        bike: bike.data as Motorcycle | null,
        balance: (balance.data as { astrapay_balance: number } | null)?.astrapay_balance ?? 0,
        recommended: (recs ?? []) as Sparepart[],
      };
    },
  });

  const { workshop, service, slot } = draft;
  if (!workshop || !service || (!slot && !draft.isHomeService)) {
    return <Text style={styles.loading}>Draft booking tidak lengkap — mulai dari Garasi.</Text>;
  }

  const homeFee = draft.isHomeService ? (workshop.home_service_fee ?? 0) : 0;
  const total = partsTotal + homeFee; // service base + selected parts + home-service fee
  const bike = info.data?.bike;

  const pay = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await payAstraPay(DEPOSIT_AMOUNT, `Deposit booking ${workshop.name}`);
      const { data, error } = await supabase.rpc('book_slot', {
        p_user_id: userId,
        p_motorcycle_id: draft.motorcycleId,
        p_workshop_id: workshop.id,
        p_slot_id: slot?.id ?? null,
        p_service_id: service.id,
        p_part_ids: draft.parts.map((p) => p.id),
      });
      if (error) throw error;
      const booking = data as Booking;
      // book_slot sets is_home_service when slot is null; attach the GPS address.
      if (draft.isHomeService && draft.homeAddress) {
        await supabase
          .from('bookings')
          .update({ home_address: draft.homeAddress })
          .eq('id', booking.id);
      }
      qc.invalidateQueries();
      draft.reset();
      router.dismissAll();
      router.replace({ pathname: '/booking/[id]', params: { id: booking.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('slot_full')) {
        Alert.alert('Slot penuh', 'Slot baru saja terisi. Pilih slot lain.', [
          { text: 'OK', onPress: () => safeBack('/(tabs)') },
        ]);
      } else {
        Alert.alert('Gagal', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]}>
        <Card>
          <Text style={styles.sectionLabel}>Ringkasan booking</Text>
          <Row icon="bicycle" text={bike ? `${bike.brand} ${bike.model} · ${bike.plate}` : '…'} />
          <Row icon="build" text={workshop.name} />
          {draft.isHomeService ? (
            <Row icon="home" text={`Home service · ${draft.homeAddress ?? 'alamat via GPS'}`} />
          ) : (
            <Row
              icon="calendar"
              text={new Date(slot!.slot_at).toLocaleString('id-ID', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          )}
          <Row icon="construct" text={`${service.name} · ${service.duration_min} menit`} />
        </Card>

        {(info.data?.recommended.length ?? 0) > 0 && (
          <Card style={styles.recCard}>
            <View style={styles.recHeader}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
              <Text style={styles.recTitle}>Rekomendasi untuk {bike?.model ?? 'motormu'}</Text>
            </View>
            {info.data!.recommended.map((p) => {
              const selected = draft.parts.some((x) => x.id === p.id);
              return (
                <Pressable
                  key={p.id}
                  style={styles.recRow}
                  onPress={() => draft.togglePart(p)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${selected ? 'Batalkan' : 'Pilih'} ${p.name}`}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selected ? colors.primary : '#98a2b3'}
                  />
                  <Text style={styles.recName}>{p.name}</Text>
                  <Text style={styles.recPrice}>{formatRp(p.price)}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.recHint}>Dipasang langsung saat servis di bengkel.</Text>
          </Card>
        )}

        <Card>
          <Text style={styles.sectionLabel}>Pembayaran</Text>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Estimasi total servis</Text>
            <Text style={styles.payValue}>{formatRp(total)}</Text>
          </View>
          {homeFee > 0 && (
            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Termasuk biaya home service</Text>
              <Text style={styles.payValue}>{formatRp(homeFee)}</Text>
            </View>
          )}
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Deposit (dibayar sekarang)</Text>
            <Text style={styles.payDeposit}>{formatRp(DEPOSIT_AMOUNT)}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Sisa (dibayar setelah servis)</Text>
            <Text style={styles.payValue}>{formatRp(Math.max(0, total - DEPOSIT_AMOUNT))}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Ionicons name="wallet-outline" size={16} color={colors.primary} />
            <Text style={styles.balanceText}>
              Saldo AstraPay: {info.data ? formatRp(info.data.balance) : '…'}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(28, insets.bottom + 8) }, tabletContainer(r)]}>
        <Pressable style={[styles.payBtn, busy && styles.payBtnBusy]} onPress={pay} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              Bayar deposit {formatRp(DEPOSIT_AMOUNT)} via AstraPay
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  sectionLabel: { fontWeight: '800', color: '#0b1727', marginBottom: 8, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rowText: { color: '#344054', flexShrink: 1, fontSize: 14 },
  recCard: { backgroundColor: '#f0fbf6', borderColor: '#cdeadd' },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  recTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  recName: { flex: 1, color: '#0b1727', fontWeight: '600', fontSize: 14 },
  recPrice: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  recHint: { color: '#4a7763', fontSize: 11, marginTop: 4 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  payLabel: { color: '#667085', fontSize: 13 },
  payValue: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  payDeposit: { fontWeight: '800', color: colors.primary, fontSize: 13 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  balanceText: { color: '#667085', fontSize: 13 },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
  },
  payBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payBtnBusy: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
