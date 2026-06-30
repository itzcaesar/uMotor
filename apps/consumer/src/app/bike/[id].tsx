import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  COMPONENT_LABELS,
  formatRp,
  type ComponentHealth,
  type ComponentType,
  type Motorcycle,
} from '@umotor/shared';
import { Illustration } from '@/components/Illustration';
import { umotor, useResponsive } from '@/components/ui';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

const COMP_ICON: Record<ComponentType, number> = {
  oil: require('../../../assets/figma/ic-engine-oil.png'),
  tire: require('../../../assets/figma/ic-tire.png'),
  battery: require('../../../assets/figma/ic-battery.png'),
  brake_pad: require('../../../assets/figma/ic-brake.png'),
  air_filter: require('../../../assets/figma/ic-air.png'),
};
const checkIcon = require('../../../assets/figma/ic-check.png');
const heartIcon = require('../../../assets/figma/ic-heart.png');
const timeIcon = require('../../../assets/figma/ic-time.png');
const screwdriverIcon = require('../../../assets/figma/ic-screwdriver.png');
const wasteIcon = require('../../../assets/figma/ic-waste.png');

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

  const contentW = Math.min(r.width, 460);
  const s = contentW / 402;
  const px = (n: number) => n * s;

  // Remove a bike and everything tied to it (clear non-cascading FKs first).
  const removeBike = async () => {
    if (!id || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { data: bks } = await supabase.from('bookings').select('id').eq('motorcycle_id', id);
      const bookingIds = (bks ?? []).map((b) => b.id as string);
      if (bookingIds.length) {
        await supabase.from('payments').delete().in('booking_id', bookingIds);
        await supabase.from('bookings').delete().eq('motorcycle_id', id);
      }
      await supabase.from('bills').delete().eq('motorcycle_id', id);
      const { error } = await supabase.from('motorcycles').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['garage'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      setConfirming(false);
      safeBack('/(tabs)/garasi');
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

  // Going up routes through advance_odometer (fires reminders); down is a manual fix.
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
        const { error } = await supabase.rpc('advance_odometer', { p_motorcycle_id: id, p_km: delta });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('motorcycles').update({ odometer_km: next }).eq('id', id);
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
          .limit(8),
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
    return (
      <View style={styles.screen}>
        <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Motor tidak ditemukan.'}</Text>
      </View>
    );
  }

  const ORDER: ComponentType[] = ['oil', 'tire', 'battery', 'brake_pad', 'air_filter'];
  const health = ORDER.map((t) => d.health.find((h) => h.type === t)).filter(Boolean) as ComponentHealth[];
  const worst = [...d.health].sort((a, b) => b.pct_used - a.pct_used)[0];
  const nextServiceKm = worst ? Math.max(0, worst.interval_km - worst.used_km) : null;
  const fmt = (n: number) => n.toLocaleString('id-ID');

  return (
    <View style={styles.screen}>
      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + px(18), paddingHorizontal: px(17) }]}>
        <Pressable onPress={() => safeBack('/(tabs)/garasi')} hitSlop={10} style={{ width: px(25), height: px(25) }} accessibilityLabel="Kembali">
          <Image source={require('../../../assets/figma/ic-back.png')} style={{ width: px(25), height: px(25) }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontSize: px(18), marginLeft: px(13) }]}>Detail Motor</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setConfirming(true)} hitSlop={10} style={[styles.trashBtn, { width: px(35), height: px(35), borderRadius: px(17.5) }]} accessibilityLabel="Hapus motor">
          <Image source={wasteIcon} style={{ width: px(17), height: px(17) }} contentFit="contain" tintColor={'#cb5a4e'} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: px(28), paddingBottom: insets.bottom + px(90) }} showsVerticalScrollIndicator={false}>
        {/* ── Motor card ── */}
        <View style={[styles.card, { borderRadius: px(15), marginTop: px(12), overflow: 'hidden' }]}>
          <View style={{ pointerEvents: 'none', position: 'absolute', right: px(-10), top: px(2), opacity: 0.14 }}>
            <Illustration name="motor" width={px(180)} />
          </View>
          <View style={{ padding: px(16) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.motorName, { fontSize: px(20) }]} numberOfLines={1}>
                {d.bike.brand} {d.bike.model}
              </Text>
              <View style={{ flex: 1 }} />
              <View style={[styles.yearBadge, { borderRadius: px(19), paddingHorizontal: px(8), paddingVertical: px(2) }]}>
                <Text style={{ fontSize: px(9), color: 'rgba(0,0,0,0.47)', fontWeight: '500' }}>{d.bike.year}</Text>
              </View>
            </View>
            <Text style={{ fontSize: px(9), color: 'rgba(0,0,0,0.47)', fontWeight: '500', marginTop: px(6) }}>{d.bike.plate}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: px(14) }}>
              <Pressable style={{ flex: 1 }} onPress={() => openOdometerEditor(d.bike.odometer_km)} accessibilityLabel={`Ubah odometer, ${d.bike.odometer_km} km`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(6) }}>
                  <Text style={[styles.odoBig, { fontSize: px(38), lineHeight: px(42) }]}>{fmt(d.bike.odometer_km)}</Text>
                  <Ionicons name="pencil" size={px(13)} color={umotor.heroDark} />
                </View>
                <Text style={{ fontSize: px(10), color: umotor.heroDark, fontWeight: '500', marginTop: px(2) }}>km odometer · ubah</Text>
              </Pressable>
              <View style={[styles.nextBox, { borderRadius: px(12), paddingHorizontal: px(12), paddingVertical: px(8) }]}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  <Text style={{ fontSize: px(30) }}>{nextServiceKm != null ? fmt(nextServiceKm) : '—'}</Text>
                  <Text style={{ fontSize: px(11) }}> km</Text>
                </Text>
                <Text style={{ fontSize: px(9.5), color: '#fff' }}>Buat servis berikutnya!</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Component health ── */}
        <SectionHeader icon={heartIcon} label="Kesehatan komponen" px={px} />
        <View style={[styles.card, { borderRadius: px(15), padding: px(14), gap: px(15) }]}>
          {health.map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.healthBar, { height: px(22), borderRadius: px(11) }]}>
                <View style={[styles.healthFill, { width: `${Math.min(100, h.pct_used)}%`, borderRadius: px(11) }]} />
                <Image source={COMP_ICON[h.type]} style={{ width: px(13), height: px(13), marginLeft: px(10), zIndex: 1 }} contentFit="contain" tintColor={'#fff'} />
                <Text style={[styles.healthLabel, { fontSize: px(10), marginLeft: px(8) }]} numberOfLines={1}>{COMPONENT_LABELS[h.type]}</Text>
                <Text style={[styles.healthPct, { fontSize: px(10) }]}>{h.pct_used}%</Text>
              </View>
              <Text style={[styles.healthUsage, { fontSize: px(8), width: px(64), marginLeft: px(6) }]}>
                {fmt(h.used_km)}/{fmt(h.interval_km)}km
              </Text>
            </View>
          ))}
        </View>

        {/* ── Service history ── */}
        <SectionHeader icon={timeIcon} label="Riwayat servis" px={px} />
        <View style={[styles.card, { borderRadius: px(15), paddingHorizontal: px(14) }]}>
          {d.history.length === 0 && (
            <Text style={{ color: umotor.faint, fontSize: px(12), paddingVertical: px(16), textAlign: 'center' }}>
              Belum ada servis tercatat lewat uMotor.
            </Text>
          )}
          {d.history.map((h, i) => (
            <Pressable
              key={h.id}
              onPress={() => router.push({ pathname: '/booking/[id]', params: { id: h.id } })}
              style={[styles.histRow, i < d.history.length - 1 && styles.histDivider, { paddingVertical: px(12) }]}
            >
              <Image source={checkIcon} style={{ width: px(18), height: px(18) }} contentFit="contain" />
              <View style={{ flex: 1, marginLeft: px(10) }}>
                <Text style={{ fontSize: px(13), color: '#000', fontWeight: '500' }} numberOfLines={1}>
                  {h.services?.name ?? 'Servis'} - {h.workshops?.name ?? '—'}
                </Text>
                <Text style={{ fontSize: px(10), color: 'rgba(0,0,0,0.34)', marginTop: px(3) }}>
                  {new Date(h.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: px(11), fontWeight: '800', color: 'rgba(0,0,0,0.4)' }}>
                  {h.total_amount != null ? `-${formatRp(h.total_amount)}` : ''}
                </Text>
                <Text style={{ fontSize: px(8), color: 'rgba(0,0,0,0.34)', marginTop: px(4) }}>Lihat Invoice</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Floating Booking Servis button ── */}
      <Pressable
        style={[styles.bookBtn, { bottom: insets.bottom + px(20), height: px(48), borderRadius: px(24), width: px(200) }]}
        onPress={() => router.push({ pathname: '/booking/new', params: { bike: d.bike.id } })}
        accessibilityRole="button"
      >
        <Image source={screwdriverIcon} style={{ width: px(16), height: px(16) }} contentFit="contain" tintColor={'#fff'} />
        <Text style={{ color: '#fff', fontSize: px(15), fontWeight: '500', marginLeft: px(8) }}>Booking Servis</Text>
      </Pressable>

      {/* odometer editor modal */}
      <Modal visible={editingOdo} transparent animationType="fade" onRequestClose={() => !savingOdo && setEditingOdo(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: umotor.primary + '14' }]}>
              <Ionicons name="speedometer-outline" size={28} color={umotor.primary} />
            </View>
            <Text style={styles.modalTitle}>Ubah odometer</Text>
            <Text style={styles.modalBody}>
              Masukkan jarak tempuh terbaru dari spidometer motormu. Menaikkan odometer memperbarui
              kesehatan komponen dan bisa memunculkan pengingat servis.
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
                onSubmitEditing={saveOdometer}
              />
              <Text style={styles.odoInputUnit}>km</Text>
            </View>
            {odoErr && <Text style={styles.modalError}>{odoErr}</Text>}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setEditingOdo(false)} disabled={savingOdo}>
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.odoSave, savingOdo && styles.modalBusy]} onPress={saveOdometer} disabled={savingOdo}>
                {savingOdo ? <ActivityIndicator color="#fff" /> : <Text style={styles.odoSaveText}>Simpan</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* delete confirm modal */}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => !busy && setConfirming(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning" size={28} color="#cb5a4e" />
            </View>
            <Text style={styles.modalTitle}>Hapus motor ini?</Text>
            <Text style={styles.modalBody}>
              {d.bike.brand} {d.bike.model} ({d.bike.plate}) akan dihapus dari garasi beserta riwayat
              servis, MotoScore, pengingat, dan tagihan terkait. Tindakan ini tidak bisa dibatalkan.
            </Text>
            {errorMsg && <Text style={styles.modalError}>{errorMsg}</Text>}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setConfirming(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>
              <Pressable style={[styles.modalDelete, busy && styles.modalBusy]} onPress={removeBike} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalDeleteText}>Hapus motor</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({ icon, label, px }: { icon: number; label: string; px: (n: number) => number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(7), marginTop: px(20), marginBottom: px(10), marginLeft: px(2) }}>
      <Image source={icon} style={{ width: px(14), height: px(14) }} contentFit="contain" tintColor={umotor.heroDark} />
      <Text style={{ fontSize: px(13), fontWeight: '500', color: umotor.heroDark }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  loading: { textAlign: 'center', color: umotor.faint, marginTop: 80 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  headerTitle: { color: umotor.heroDark, fontWeight: '500' },
  trashBtn: { backgroundColor: '#fdecec', alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#fff' },
  motorName: { color: '#1e1e1e', fontWeight: '800', flexShrink: 1 },
  yearBadge: { backgroundColor: '#b5d4ff' },
  odoBig: { color: umotor.heroDark, fontWeight: '800' },
  nextBox: { backgroundColor: umotor.heroDark, alignItems: 'flex-start' },

  healthBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#a8c7f1', overflow: 'hidden' },
  healthFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: umotor.heroDark },
  healthLabel: { color: '#fff', fontWeight: '600', flex: 1 },
  healthPct: { color: '#36507e', fontWeight: '700', marginRight: 12, zIndex: 1 },
  healthUsage: { color: 'rgba(28,78,147,0.5)', fontWeight: '600' },

  histRow: { flexDirection: 'row', alignItems: 'center' },
  histDivider: { borderBottomWidth: 1, borderBottomColor: '#eef2f8' },

  bookBtn: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: umotor.heroDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 8px rgba(0,0,0,0.22)',
    elevation: 6,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11,23,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 18, padding: 22, alignItems: 'center', gap: 8 },
  modalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fdecec', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: umotor.ink },
  modalBody: { color: '#475467', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  modalError: { color: '#cb5a4e', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' },
  modalCancel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: umotor.bg, borderWidth: 1, borderColor: umotor.line },
  modalCancelText: { color: '#344054', fontWeight: '700', fontSize: 14 },
  odoInputRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 14, backgroundColor: umotor.bg, borderRadius: 12, borderWidth: 1, borderColor: umotor.line, paddingHorizontal: 14 },
  odoInput: { flex: 1, minWidth: 0, fontSize: 26, fontWeight: '800', color: umotor.ink, paddingVertical: 12 },
  odoInputUnit: { fontSize: 15, fontWeight: '700', color: umotor.faint },
  odoSave: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: umotor.primary },
  odoSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalDelete: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#cb5a4e' },
  modalBusy: { opacity: 0.7 },
  modalDeleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
