import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  COMPONENT_LABELS,
  colors,
  formatRp,
  healthColor,
  type ComponentHealth,
  type Motorcycle,
} from '@umotor/shared';
import { Card, HealthBar, tabletContainer, useResponsive } from '@/components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

interface ServiceHistory {
  id: string;
  created_at: string;
  total_amount: number | null;
  workshops: { name: string } | null;
  services: { name: string } | null;
}

export default function BikeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingOdo, setEditingOdo] = useState(false);
  const [odoInput, setOdoInput] = useState('');
  const [savingOdo, setSavingOdo] = useState(false);
  const [odoErr, setOdoErr] = useState<string | null>(null);

  // Remove a bike and everything tied to it. Only `components` cascades on the
  // motorcycles FK; bookings/bills/payments do not, so clear those first to
  // avoid a foreign-key violation (works for any bike, not just freshly added).
  const removeBike = async () => {
    if (!id || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { data: bks } = await supabase.from('bookings').select('id').eq('motorcycle_id', id);
      const bookingIds = (bks ?? []).map((b) => b.id as string);
      if (bookingIds.length) {
        await supabase.from('payments').delete().in('booking_id', bookingIds);
        await supabase.from('bookings').delete().eq('motorcycle_id', id); // booking_parts cascade
      }
      await supabase.from('bills').delete().eq('motorcycle_id', id);
      const { error } = await supabase.from('motorcycles').delete().eq('id', id); // components cascade
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['garage'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      setConfirming(false);
      safeBack('/(tabs)');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Gagal menghapus. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const openOdometerEditor = (current: number) => {
    setOdoInput(String(current));
    setOdoErr(null);
    setEditingOdo(true);
  };

  // Save an edited odometer. Going up routes through advance_odometer so the
  // 80/95/100% maintenance reminders fire exactly as on a real ride; going down
  // is a manual correction (no reminders), written straight to the row.
  const saveOdometer = async () => {
    if (!id || savingOdo || !detail.data) return;
    const next = parseInt(odoInput.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(next) || next < 0) {
      setOdoErr('Masukkan jarak tempuh (km) yang valid.');
      return;
    }
    const current = detail.data.bike.odometer_km;
    if (next === current) {
      setEditingOdo(false);
      return;
    }
    setSavingOdo(true);
    setOdoErr(null);
    try {
      const delta = next - current;
      if (delta > 0) {
        const { error } = await supabase.rpc('advance_odometer', {
          p_motorcycle_id: id,
          p_km: delta,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('motorcycles')
          .update({ odometer_km: next })
          .eq('id', id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['bike', id] });
      qc.invalidateQueries({ queryKey: ['garage'] });
      qc.invalidateQueries({ queryKey: ['maintenance-banner'] });
      setEditingOdo(false);
    } catch (e) {
      setOdoErr(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSavingOdo(false);
    }
  };

  const detail = useQuery({
    queryKey: ['bike', id],
    enabled: !!id,
    queryFn: async () => {
      const [bike, health, history] = await Promise.all([
        supabase.from('motorcycles').select('*').eq('id', id!).single(),
        supabase.from('component_health').select('*').eq('motorcycle_id', id!),
        supabase
          .from('bookings')
          .select('id, created_at, total_amount, workshops(name), services(name)')
          .eq('motorcycle_id', id!)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (bike.error) throw bike.error;
      return {
        bike: bike.data as Motorcycle,
        health: (health.data ?? []) as ComponentHealth[],
        history: (history.data ?? []) as unknown as ServiceHistory[],
      };
    },
  });

  const d = detail.data;
  if (!d) {
    return <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Motor tidak ditemukan.'}</Text>;
  }

  const worst = [...d.health].sort((a, b) => b.pct_used - a.pct_used)[0];
  const nextServiceKm = worst ? Math.max(0, worst.interval_km - worst.used_km) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]}>
        <Card>
          <Text style={styles.model}>
            {d.bike.brand} {d.bike.model}
          </Text>
          <Text style={styles.plate}>
            {d.bike.plate} · {d.bike.year}
          </Text>
          <View style={styles.odoRow}>
            <Pressable
              style={styles.odoBox}
              onPress={() => openOdometerEditor(d.bike.odometer_km)}
              accessibilityRole="button"
              accessibilityLabel={`Ubah odometer, sekarang ${d.bike.odometer_km} km`}
            >
              <View style={styles.odoEdit}>
                <Ionicons name="pencil" size={13} color={colors.primary} />
              </View>
              <Text style={styles.odoValue}>{d.bike.odometer_km.toLocaleString('id-ID')}</Text>
              <Text style={styles.odoLabel}>km odometer · ubah</Text>
            </Pressable>
            <View style={styles.odoBox}>
              <Text style={[styles.odoValue, { color: worst ? healthColor(worst.pct_used) : colors.accent }]}>
                ±{nextServiceKm?.toLocaleString('id-ID') ?? '—'}
              </Text>
              <Text style={styles.odoLabel}>km ke servis berikut</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Kesehatan komponen</Text>
        <Card>
          {d.health
            .slice()
            .sort((a, b) => b.pct_used - a.pct_used)
            .map((h) => (
              <View key={h.id} style={styles.compRow}>
                <HealthBar label={COMPONENT_LABELS[h.type]} pctUsed={h.pct_used} />
                <Text style={styles.compMeta}>
                  {h.used_km.toLocaleString('id-ID')} / {h.interval_km.toLocaleString('id-ID')} km
                </Text>
              </View>
            ))}
        </Card>

        <Text style={styles.sectionTitle}>Riwayat servis</Text>
        <Card>
          {d.history.map((h) => (
            <View key={h.id} style={styles.histRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <View style={styles.histInfo}>
                <Text style={styles.histService}>
                  {h.services?.name ?? 'Servis'} · {h.workshops?.name ?? '—'}
                </Text>
                <Text style={styles.histDate}>
                  {new Date(h.created_at).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <Text style={styles.histAmount}>
                {h.total_amount != null ? formatRp(h.total_amount) : ''}
              </Text>
            </View>
          ))}
          {d.history.length === 0 && (
            <Text style={styles.empty}>Belum ada servis tercatat lewat uMotor.</Text>
          )}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(28, insets.bottom + 8) }, tabletContainer(r)]}>
        <Pressable style={styles.deleteBtn} onPress={() => setConfirming(true)}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
        <Pressable
          style={styles.cta}
          onPress={() => router.push({ pathname: '/booking/new', params: { bike: d.bike.id } })}
        >
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.ctaText}>Booking servis</Text>
        </Pressable>
      </View>

      <Modal
        visible={editingOdo}
        transparent
        animationType="fade"
        onRequestClose={() => !savingOdo && setEditingOdo(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: colors.primary + '14' }]}>
              <Ionicons name="speedometer-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Ubah odometer</Text>
            <Text style={styles.modalBody}>
              Masukkan jarak tempuh terbaru dari spidometer motormu. Menaikkan odometer akan
              memperbarui kesehatan komponen dan bisa memunculkan pengingat servis.
            </Text>
            <View style={styles.odoInputRow}>
              <TextInput
                style={styles.odoInput}
                value={odoInput}
                onChangeText={(t) => setOdoInput(t.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={7}
                placeholder="0"
                placeholderTextColor="#cbd5e1"
                autoFocus
                accessibilityLabel="Jarak tempuh odometer dalam kilometer"
                onSubmitEditing={saveOdometer}
              />
              <Text style={styles.odoInputUnit}>km</Text>
            </View>
            {odoErr && <Text style={styles.modalError}>{odoErr}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setEditingOdo(false)}
                disabled={savingOdo}
                accessibilityRole="button"
                accessibilityLabel="Batal ubah odometer"
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.odoSave, savingOdo && styles.modalBusy]}
                onPress={saveOdometer}
                disabled={savingOdo}
                accessibilityRole="button"
                accessibilityLabel="Simpan odometer"
              >
                {savingOdo ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.odoSaveText}>Simpan</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirming}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setConfirming(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={28} color={colors.danger} />
            </View>
            <Text style={styles.modalTitle}>Hapus motor ini?</Text>
            <Text style={styles.modalBody}>
              {d.bike.brand} {d.bike.model} ({d.bike.plate}) akan dihapus dari garasi. Kamu akan
              kehilangan semua manfaat uMotor untuk motor ini: riwayat servis, MotoScore, pengingat
              perawatan, dan tagihan yang terkait. Tindakan ini tidak bisa dibatalkan.
            </Text>
            {errorMsg && <Text style={styles.modalError}>{errorMsg}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setConfirming(false)}
                disabled={busy}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDelete, busy && styles.modalBusy]}
                onPress={removeBike}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalDeleteText}>Hapus motor</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  model: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  plate: { color: '#667085', marginTop: 2 },
  odoRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  odoBox: {
    flex: 1,
    backgroundColor: '#f3f6fb',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  odoValue: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  odoLabel: { fontSize: 11, color: '#98a2b3' },
  odoEdit: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '14',
  },
  odoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 14,
    backgroundColor: '#f3f6fb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e9f0',
    paddingHorizontal: 14,
  },
  odoInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#0b1727',
    paddingVertical: 12,
  },
  odoInputUnit: { fontSize: 15, fontWeight: '700', color: '#98a2b3' },
  odoSave: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  odoSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  compRow: { paddingVertical: 4 },
  compMeta: { fontSize: 11, color: '#98a2b3', marginLeft: 100, marginTop: 2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  histInfo: { flex: 1, gap: 1 },
  histService: { color: '#0b1727', fontWeight: '600', fontSize: 13 },
  histDate: { color: '#98a2b3', fontSize: 11 },
  histAmount: { color: '#667085', fontWeight: '700', fontSize: 13 },
  empty: { color: '#98a2b3' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
  },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#f3c0c0',
    backgroundColor: '#fef2f2',
  },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,23,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  modalBody: { color: '#475467', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  modalError: { color: colors.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f3f6fb',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  modalCancelText: { color: '#344054', fontWeight: '700', fontSize: 14 },
  modalDelete: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.danger,
  },
  modalBusy: { opacity: 0.7 },
  modalDeleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
