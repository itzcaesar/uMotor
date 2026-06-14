import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, INSTALL_SERVICE_CODE, type Service, type Slot, type Workshop } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { supabase } from '@/lib/supabase';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Mock GPS pin result (no real location permission needed for the demo).
const MOCK_GPS_ADDRESS = 'Jl. Sukajadi No. 88, Bandung (lokasi via GPS)';

// Local-date key (NOT toISOString — UTC date is yesterday before 07:00 WIB).
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
    // Slot availability changes from other devices; poll as realtime fallback.
    refetchInterval: 15_000,
    queryFn: async () => {
      const [w, s, sl] = await Promise.all([
        supabase.from('workshops').select('*').eq('id', id!).single(),
        supabase.from('services').select('*').order('duration_min'),
        supabase
          .from('slots')
          .select('*')
          .eq('workshop_id', id!)
          .gte('slot_at', new Date().toISOString())
          .order('slot_at'),
      ]);
      if (w.error) throw w.error;
      return {
        workshop: w.data as Workshop,
        services: (s.data ?? []) as Service[],
        slots: (sl.data ?? []) as Slot[],
      };
    },
  });

  // Preselect the service the maintenance banner suggested (e.g. oil_change).
  // The marketplace-only "pasang_sparepart" service is never bookable here.
  const bookableServices = useMemo(
    () => (detail.data?.services ?? []).filter((s) => s.code !== INSTALL_SERVICE_CODE),
    [detail.data?.services],
  );

  useEffect(() => {
    if (!serviceId && bookableServices.length) {
      const preferred =
        bookableServices.find((s) => s.code === preferredServiceCode) ?? bookableServices[0];
      if (preferred) setServiceId(preferred.id);
    }
  }, [bookableServices, preferredServiceCode, serviceId]);

  // Live slot updates (PRD 01 §4.5): booked_count changes are UPDATEs, but the
  // partner Jadwal tab opens/closes slots via INSERT/DELETE — listen to all.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`slots-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slots', filter: `workshop_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ['workshop', id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const daySlots = useMemo(
    () => (detail.data?.slots ?? []).filter((s) => dayKey(new Date(s.slot_at)) === day),
    [detail.data?.slots, day],
  );

  // Operating hours derived from the workshop's actual open slots (earliest →
  // latest hour) — real signal, no schema column needed.
  const hours = useMemo(() => {
    const all = detail.data?.slots ?? [];
    if (!all.length) return null;
    let min = 24;
    let max = 0;
    for (const s of all) {
      const h = new Date(s.slot_at).getHours();
      if (h < min) min = h;
      if (h > max) max = h;
    }
    const fmt = (h: number) => `${String(h).padStart(2, '0')}.00`;
    return { open: fmt(min), close: fmt(max) };
  }, [detail.data?.slots]);

  const w = detail.data?.workshop;
  const service = detail.data?.services.find((s) => s.id === serviceId) ?? null;
  const slot = daySlots.find((s) => s.id === slotId) ?? null;
  const availableToday = daySlots.filter((s) => s.booked_count < s.capacity).length;
  const canContinue =
    mode === 'home' ? !!service && address.trim().length > 0 : !!service && !!slot;

  if (!w) {
    return <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Bengkel tidak ditemukan.'}</Text>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]}>
        <Card style={styles.headerCard}>
          <View style={styles.headRow}>
            <View style={styles.headMain}>
              <Text style={styles.name}>{w.name}</Text>
              <View style={styles.badgeRow}>
                {w.type === 'ahass' ? (
                  <View style={styles.ahass}>
                    <Text style={styles.ahassText}>AHASS</Text>
                  </View>
                ) : (
                  <View style={styles.umum}>
                    <Text style={styles.umumText}>Bengkel Umum</Text>
                  </View>
                )}
                {w.tier === 'premium' && (
                  <View style={styles.premium}>
                    <Ionicons name="diamond" size={9} color="#067647" />
                    <Text style={styles.premiumText}>Premium</Text>
                  </View>
                )}
                <View style={styles.verified}>
                  <Ionicons name="checkmark-circle" size={11} color={colors.primary} />
                  <Text style={styles.verifiedText}>Terverifikasi</Text>
                </View>
              </View>
            </View>
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={14} color="#f5a623" />
              <Text style={styles.ratingValue}>{Number(w.rating).toFixed(1)}</Text>
            </View>
          </View>

          <View style={styles.infoList}>
            <InfoRow icon="location-outline" text={w.address ?? 'Alamat tidak tersedia'} />
            <InfoRow
              icon="navigate-outline"
              text={w.distance_km != null ? `${w.distance_km} km dari lokasimu` : 'Jarak tidak tersedia'}
            />
            {hours && <InfoRow icon="time-outline" text={`Jam operasi ${hours.open}–${hours.close}`} />}
            <InfoRow
              icon="pricetag-outline"
              text={`Estimasi ${formatRp(w.price_estimate_min ?? 0)} – ${formatRp(w.price_estimate_max ?? 0)}`}
            />
          </View>

          <View style={styles.featureRow}>
            {w.home_service && <Feature icon="home" text="Home service" />}
            {w.type === 'ahass' && <Feature icon="shield-checkmark" text="Suku cadang asli" />}
            <Feature icon="wallet" text="Bayar via AstraPay" />
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Jenis servis</Text>
        <View style={styles.services}>
          {bookableServices.map((s) => {
            const active = s.id === serviceId;
            return (
              <Pressable
                key={s.id}
                style={[styles.serviceCard, active && styles.serviceActive]}
                onPress={() => setServiceId(s.id)}
              >
                <Text style={[styles.serviceName, active && styles.serviceNameActive]}>{s.name}</Text>
                <Text style={styles.serviceMeta}>{s.duration_min} menit</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Booking mode: only offer Home service when the workshop supports it. */}
        {w.home_service && (
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === 'workshop' && styles.modeActive]}
              onPress={() => setMode('workshop')}
            >
              <Ionicons
                name="business-outline"
                size={16}
                color={mode === 'workshop' ? colors.primary : '#667085'}
              />
              <Text style={[styles.modeText, mode === 'workshop' && styles.modeTextActive]}>
                Di bengkel
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'home' && styles.modeActive]}
              onPress={() => setMode('home')}
            >
              <Ionicons
                name="home-outline"
                size={16}
                color={mode === 'home' ? colors.primary : '#667085'}
              />
              <Text style={[styles.modeText, mode === 'home' && styles.modeTextActive]}>
                Home service
              </Text>
            </Pressable>
          </View>
        )}

        {mode === 'home' ? (
          <>
            <Text style={styles.sectionTitle}>Alamat home service</Text>
            <Card style={styles.addrCard}>
              <Pressable style={styles.gpsBtn} onPress={() => setAddress(MOCK_GPS_ADDRESS)}>
                <Ionicons name="locate" size={16} color="#fff" />
                <Text style={styles.gpsText}>Gunakan lokasi GPS</Text>
              </Pressable>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Ketik alamat atau tekan tombol GPS…"
                placeholderTextColor="#98a2b3"
                style={styles.addrInput}
                multiline
              />
              <View style={styles.feeRow}>
                <Ionicons name="bicycle-outline" size={14} color={colors.primary} />
                <Text style={styles.feeText}>
                  Biaya kunjungan mekanik {formatRp(w.home_service_fee ?? 0)}
                  {w.home_service_radius_km ? ` · radius ${w.home_service_radius_km} km` : ''}
                </Text>
              </View>
            </Card>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Pilih hari</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {days.map((d) => {
                const key = dayKey(d);
                const active = key === day;
                return (
                  <Pressable
                    key={key}
                    style={[styles.dayCard, active && styles.dayActive]}
                    onPress={() => {
                      setDay(key);
                      setSlotId(null);
                    }}
                  >
                    <Text style={[styles.dayLabel, active && styles.dayTextActive]}>
                      {DAY_LABELS[d.getDay()]}
                    </Text>
                    <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.slotHeader}>
              <Text style={styles.sectionTitle}>Pilih slot</Text>
              {daySlots.length > 0 && (
                <Text style={[styles.slotAvail, availableToday === 0 && styles.slotAvailNone]}>
                  {availableToday > 0 ? `${availableToday} slot tersedia` : 'Penuh'}
                </Text>
              )}
            </View>
            <View style={styles.slots}>
              {daySlots.map((s) => {
                const full = s.booked_count >= s.capacity;
                const active = s.id === slotId;
                const time = new Date(s.slot_at).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <Pressable
                    key={s.id}
                    disabled={full}
                    style={[styles.slot, active && styles.slotActive, full && styles.slotFull]}
                    onPress={() => setSlotId(s.id)}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        active && styles.slotTextActive,
                        full && styles.slotTextFull,
                      ]}
                    >
                      {full ? `${time} · penuh` : time}
                    </Text>
                  </Pressable>
                );
              })}
              {daySlots.length === 0 && (
                <Text style={styles.empty}>Tidak ada slot tersisa untuk hari ini.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(28, insets.bottom + 8) }, tabletContainer(r)]}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerHint} numberOfLines={1}>
            {service ? service.name : '—'}
            {mode === 'home'
              ? ' · Home service'
              : slot
                ? ` · ${new Date(slot.slot_at).toLocaleString('id-ID', {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
          </Text>
          <Text style={styles.footerLocked}>
            {mode === 'home'
              ? address
                ? 'Mekanik datang ke alamatmu'
                : 'Isi alamat dulu'
              : slot
                ? 'Slot terkunci saat konfirmasi'
                : 'Pilih slot dulu'}
          </Text>
        </View>
        <Pressable
          style={[styles.next, !canContinue && styles.nextDisabled]}
          disabled={!canContinue}
          onPress={() => {
            setWorkshop(w);
            if (mode === 'home') {
              setHomeService(service!, address.trim());
            } else {
              setServiceSlot(service!, slot!);
            }
            router.push('/booking/confirm');
          }}
        >
          <Text style={styles.nextText}>Lanjut</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={15} color="#98a2b3" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function Feature({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons name={icon} size={13} color={colors.accent} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  headerCard: { gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headMain: { flex: 1, gap: 6 },
  name: { fontSize: 18, fontWeight: '800', color: '#0b1727' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  ahass: { backgroundColor: '#dc2626', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ahassText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  umum: {
    backgroundColor: '#eef1f6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  umumText: { color: '#667085', fontSize: 10, fontWeight: '800' },
  premium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e2f6ee',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  premiumText: { color: '#067647', fontSize: 10, fontWeight: '800' },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#eef4fd',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff7e6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingValue: { color: '#b7791f', fontWeight: '800', fontSize: 15 },
  infoList: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#475467', fontSize: 13, flexShrink: 1 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0faf5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  featureText: { color: '#067647', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  slotAvail: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  slotAvailNone: { color: '#98a2b3' },
  services: { flexDirection: 'row', gap: 10 },
  serviceCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
    gap: 2,
  },
  serviceActive: { borderColor: colors.primary, backgroundColor: '#eef4fd' },
  serviceName: { fontWeight: '700', color: '#667085', fontSize: 13 },
  serviceNameActive: { color: colors.primary },
  serviceMeta: { fontSize: 11, color: '#98a2b3' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
  },
  modeActive: { borderColor: colors.primary, backgroundColor: '#eef4fd' },
  modeText: { fontWeight: '700', color: '#667085', fontSize: 13 },
  modeTextActive: { color: colors.primary },
  addrCard: { gap: 10 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  gpsText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addrInput: {
    borderWidth: 1,
    borderColor: '#e5e9f0',
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    color: '#0b1727',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeText: { color: '#667085', fontSize: 12, flexShrink: 1 },
  days: { gap: 8 },
  dayCard: {
    width: 56,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e9f0',
    alignItems: 'center',
    gap: 2,
  },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLabel: { fontSize: 11, color: '#98a2b3', fontWeight: '600' },
  dayNum: { fontSize: 16, fontWeight: '800', color: '#0b1727' },
  dayTextActive: { color: '#fff' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotFull: { backgroundColor: '#eef1f6', borderColor: '#eef1f6' },
  slotText: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  slotTextActive: { color: '#fff' },
  slotTextFull: { color: '#98a2b3' },
  empty: { color: '#98a2b3' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
    padding: 16,
    paddingBottom: 28,
  },
  footerInfo: { flex: 1, marginRight: 12 },
  footerHint: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  footerLocked: { color: '#98a2b3', fontSize: 12, marginTop: 2 },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  nextDisabled: { opacity: 0.4 },
  nextText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
