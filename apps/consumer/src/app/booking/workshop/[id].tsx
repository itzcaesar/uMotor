import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, INSTALL_SERVICE_CODE, type Service, type Slot, type Workshop } from '@umotor/shared';
import { umotor, useResponsive } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { safeBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

const backIcon = require('../../../../assets/figma/ic-back.png');
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MOCK_GPS_ADDRESS = 'Jl. Sukajadi No. 88, Bandung (lokasi via GPS)';

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WorkshopDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { preferredServiceCode, setServiceSlot, setHomeService, setWorkshop } = useDraft();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<string>(dayKey(new Date()));
  const [slotId, setSlotId] = useState<string | null>(null);
  const [mode, setMode] = useState<'workshop' | 'home'>('workshop');
  const [address, setAddress] = useState<string>('');
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const detail = useQuery({
    queryKey: ['workshop', id],
    enabled: !!id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [w, s, sl] = await Promise.all([
        supabase.from('workshops').select('*').eq('id', id!).single(),
        supabase.from('services').select('*').order('duration_min'),
        supabase.from('slots').select('*').eq('workshop_id', id!).gte('slot_at', new Date().toISOString()).order('slot_at'),
      ]);
      if (w.error) throw w.error;
      return { workshop: w.data as Workshop, services: (s.data ?? []) as Service[], slots: (sl.data ?? []) as Slot[] };
    },
  });

  const bookableServices = useMemo(
    () => (detail.data?.services ?? []).filter((s) => s.code !== INSTALL_SERVICE_CODE),
    [detail.data?.services],
  );

  useEffect(() => {
    if (!serviceId && bookableServices.length) {
      const preferred = bookableServices.find((s) => s.code === preferredServiceCode) ?? bookableServices[0];
      if (preferred) setServiceId(preferred.id);
    }
  }, [bookableServices, preferredServiceCode, serviceId]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`slots-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots', filter: `workshop_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ['workshop', id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const daySlots = useMemo(() => (detail.data?.slots ?? []).filter((s) => dayKey(new Date(s.slot_at)) === day), [detail.data?.slots, day]);

  const w = detail.data?.workshop;
  const service = detail.data?.services.find((s) => s.id === serviceId) ?? null;
  const slot = daySlots.find((s) => s.id === slotId) ?? null;
  const availableToday = daySlots.filter((s) => s.booked_count < s.capacity).length;
  const canContinue = mode === 'home' ? !!service && address.trim().length > 0 : !!service && !!slot;

  if (!w) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Bengkel tidak ditemukan.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/booking/new')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Pilih Slot</Text>
      </View>

      <ScrollView contentContainerStyle={[{ paddingHorizontal: 18, paddingBottom: insets.bottom + 100 }, r.isTablet && { maxWidth: 640, width: '100%', alignSelf: 'center' }]} showsVerticalScrollIndicator={false}>
        {/* workshop info card */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text style={styles.wName} numberOfLines={2}>{w.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="star" size={20} color="#f5a623" />
              <Text style={styles.wRating}>{Number(w.rating).toFixed(1)}</Text>
            </View>
          </View>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={9} color={umotor.heroDark} />
              <Text style={styles.badgeText}>Terverifikasi</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{w.type === 'ahass' ? 'AHASS' : 'Bengkel Umum'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <InfoRow icon="location-outline" text={w.address ?? 'Alamat tidak tersedia'} />
          <InfoRow icon="navigate-outline" text={w.distance_km != null ? `${w.distance_km} km dari lokasimu` : 'Jarak tidak tersedia'} />
          <InfoRow icon="pricetag-outline" text={`Estimasi ${formatRp(w.price_estimate_min ?? 0)} - ${formatRp(w.price_estimate_max ?? 0)}`} />
          <View style={styles.featurePills}>
            {w.type === 'ahass' && <FeaturePill icon="shield-checkmark" text="Suku cadang asli" />}
            <FeaturePill icon="wallet" text="Bayar pake AstraPay" />
          </View>
        </View>

        {/* jenis servis */}
        <Text style={styles.section}>Jenis servis</Text>
        <View style={styles.serviceRow}>
          {bookableServices.map((s) => {
            const active = s.id === serviceId;
            return (
              <Pressable key={s.id} style={[styles.serviceCard, active ? styles.serviceActive : styles.serviceIdle]} onPress={() => setServiceId(s.id)}>
                <Text style={[styles.serviceName, { color: active ? umotor.heroDark : '#7a7a7a' }]} numberOfLines={1}>{s.name}</Text>
                <Text style={[styles.serviceMin, { color: active ? 'rgba(28,78,147,0.52)' : '#bababa' }]}>{s.duration_min} menit</Text>
              </Pressable>
            );
          })}
        </View>

        {/* mode toggle (home service) */}
        {w.home_service && (
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeBtn, mode === 'workshop' && styles.modeActive]} onPress={() => setMode('workshop')}>
              <Ionicons name="business-outline" size={16} color={mode === 'workshop' ? umotor.primary : umotor.sub} />
              <Text style={[styles.modeText, mode === 'workshop' && { color: umotor.primary }]}>Di bengkel</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === 'home' && styles.modeActive]} onPress={() => setMode('home')}>
              <Ionicons name="home-outline" size={16} color={mode === 'home' ? umotor.primary : umotor.sub} />
              <Text style={[styles.modeText, mode === 'home' && { color: umotor.primary }]}>Home service</Text>
            </Pressable>
          </View>
        )}

        {mode === 'home' ? (
          <>
            <Text style={styles.section}>Alamat home service</Text>
            <View style={styles.addrCard}>
              <Pressable style={styles.gpsBtn} onPress={() => setAddress(MOCK_GPS_ADDRESS)}>
                <Ionicons name="locate" size={16} color="#fff" />
                <Text style={styles.gpsText}>Gunakan lokasi GPS</Text>
              </Pressable>
              <TextInput value={address} onChangeText={setAddress} placeholder="Ketik alamat atau tekan tombol GPS…" placeholderTextColor="#98a2b3" style={styles.addrInput} multiline />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="bicycle-outline" size={14} color={umotor.primary} />
                <Text style={styles.feeText}>Biaya kunjungan mekanik {formatRp(w.home_service_fee ?? 0)}{w.home_service_radius_km ? ` · radius ${w.home_service_radius_km} km` : ''}</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.section}>Pilih hari</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {days.map((d) => {
                const key = dayKey(d);
                const active = key === day;
                return (
                  <Pressable key={key} style={[styles.dayCard, active ? styles.dayActive : styles.dayIdle]} onPress={() => { setDay(key); setSlotId(null); }}>
                    <Text style={[styles.dayLabel, { color: active ? '#fff' : 'rgba(0,0,0,0.26)' }]}>{DAY_LABELS[d.getDay()]}</Text>
                    <Text style={[styles.dayNum, { color: active ? '#fff' : 'rgba(0,0,0,0.33)' }]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.section, { marginTop: 18 }]}>Pilih slot</Text>
            {daySlots.length === 0 ? (
              <Text style={styles.noSlot}>Tidak ada slot tersisa untuk hari ini.</Text>
            ) : (
              <View style={styles.slots}>
                {daySlots.map((s) => {
                  const full = s.booked_count >= s.capacity;
                  const active = s.id === slotId;
                  const time = new Date(s.slot_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <Pressable key={s.id} disabled={full} style={[styles.slot, active && styles.slotActive, full && styles.slotFull]} onPress={() => setSlotId(s.id)}>
                      <Text style={[styles.slotText, active && { color: '#fff' }, full && { color: '#98a2b3' }]}>{full ? `${time} · penuh` : time}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {daySlots.length > 0 && (
              <Text style={[styles.availHint, availableToday === 0 && { color: '#98a2b3' }]}>
                {availableToday > 0 ? `${availableToday} slot tersedia` : 'Penuh'}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.footerTitle} numberOfLines={1}>{service ? service.name : 'Pilih servis'}</Text>
          <Text style={styles.footerHint} numberOfLines={1}>
            {mode === 'home' ? (address ? 'Mekanik datang ke alamatmu' : 'Isi alamat dulu!') : slot ? `${new Date(slot.slot_at).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Pilih slot dulu!'}
          </Text>
        </View>
        <Pressable
          style={[styles.next, !canContinue && styles.nextDisabled]}
          disabled={!canContinue}
          onPress={() => {
            setWorkshop(w);
            if (mode === 'home') setHomeService(service!, address.trim());
            else setServiceSlot(service!, slot!);
            router.push('/booking/confirm');
          }}
        >
          <Text style={styles.nextText}>Lanjut</Text>
        </Pressable>
      </View>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color="rgba(0,0,0,0.35)" />
      <Text style={styles.infoText} numberOfLines={1}>{text}</Text>
    </View>
  );
}
function FeaturePill({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fPill}>
      <Ionicons name={icon} size={11} color="#00a86b" />
      <Text style={styles.fPillText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  loading: { textAlign: 'center', color: umotor.faint, marginTop: 80 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },

  infoCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)', padding: 18, gap: 8 },
  wName: { flex: 1, fontSize: 20, fontWeight: '500', color: '#000' },
  wRating: { fontSize: 26, fontWeight: '800', color: '#000' },
  badges: { flexDirection: 'row', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#c5dbf9', borderRadius: 15, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: umotor.heroDark, fontSize: 8, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#eef2f8', marginVertical: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: 'rgba(0,0,0,0.45)', fontSize: 11, fontWeight: '500', flexShrink: 1 },
  featurePills: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  fPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e2f6ee', borderRadius: 33, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.2)' },
  fPillText: { color: '#00a86b', fontSize: 8, fontWeight: '600' },

  section: { fontSize: 16, fontWeight: '800', color: umotor.heroDark, marginTop: 20, marginBottom: 12 },
  serviceRow: { flexDirection: 'row', gap: 11 },
  serviceCard: { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' },
  serviceActive: { backgroundColor: '#daeaff', borderWidth: 1, borderColor: '#3a76ca' },
  serviceIdle: { backgroundColor: '#fbfbfb', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.3)' },
  serviceName: { fontSize: 12, fontWeight: '500' },
  serviceMin: { fontSize: 8, fontWeight: '500', marginTop: 2 },

  modeRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, borderWidth: 1.5, borderColor: umotor.line },
  modeActive: { borderColor: umotor.primary, backgroundColor: '#eef4fd' },
  modeText: { fontWeight: '700', color: umotor.sub, fontSize: 13 },

  addrCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: umotor.line },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: umotor.primary, borderRadius: 10, paddingVertical: 10 },
  gpsText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addrInput: { borderWidth: 1, borderColor: umotor.line, borderRadius: 10, padding: 12, minHeight: 60, color: umotor.ink, fontSize: 14, textAlignVertical: 'top' },
  feeText: { color: umotor.sub, fontSize: 12, flexShrink: 1 },

  dayCard: { width: 60, height: 60, borderRadius: 7, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayActive: { backgroundColor: umotor.heroDark },
  dayIdle: { backgroundColor: '#fbfbfb', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.16)' },
  dayLabel: { fontSize: 10, fontWeight: '500' },
  dayNum: { fontSize: 26, fontWeight: '800' },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: umotor.line },
  slotActive: { backgroundColor: umotor.heroDark, borderColor: umotor.heroDark },
  slotFull: { backgroundColor: '#eef1f6', borderColor: '#eef1f6' },
  slotText: { fontWeight: '700', color: umotor.ink, fontSize: 13 },
  noSlot: { color: 'rgba(28,78,147,0.4)', fontSize: 11, fontWeight: '500' },
  availHint: { color: '#00a86b', fontSize: 12, fontWeight: '700', marginTop: 10 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: umotor.line, paddingHorizontal: 24, paddingTop: 12, boxShadow: '0px -3px 11px rgba(0,0,0,0.12)', elevation: 12 },
  footerTitle: { fontSize: 16, fontWeight: '800', color: umotor.heroDark },
  footerHint: { fontSize: 13, fontWeight: '500', color: 'rgba(28,78,147,0.4)', marginTop: 2 },
  next: { backgroundColor: umotor.heroDark, borderRadius: 11, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  nextDisabled: { backgroundColor: 'rgba(28,78,147,0.35)' },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
