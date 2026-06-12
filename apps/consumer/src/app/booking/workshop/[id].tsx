import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, type Service, type Slot, type Workshop } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useDraft } from '@/lib/draft';
import { supabase } from '@/lib/supabase';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function WorkshopDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { preferredServiceCode, setServiceSlot, setWorkshop } = useDraft();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [day, setDay] = useState<string>(dayKey(new Date()));
  const [slotId, setSlotId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['workshop', id],
    enabled: !!id,
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
  useEffect(() => {
    if (!serviceId && detail.data) {
      const preferred =
        detail.data.services.find((s) => s.code === preferredServiceCode) ??
        detail.data.services[0];
      if (preferred) setServiceId(preferred.id);
    }
  }, [detail.data, preferredServiceCode, serviceId]);

  // Live slot updates: a slot booked from another phone flips to "penuh" here (PRD 01 §4.5).
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`slots-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'slots', filter: `workshop_id=eq.${id}` },
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

  const w = detail.data?.workshop;
  const service = detail.data?.services.find((s) => s.id === serviceId) ?? null;
  const slot = daySlots.find((s) => s.id === slotId) ?? null;

  if (!w) {
    return <Text style={styles.loading}>{detail.isLoading ? 'Memuat…' : 'Bengkel tidak ditemukan.'}</Text>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.headRow}>
            <Text style={styles.name}>{w.name}</Text>
            {w.type === 'ahass' && (
              <View style={styles.ahass}>
                <Text style={styles.ahassText}>AHASS</Text>
              </View>
            )}
          </View>
          <Text style={styles.meta}>
            ★ {Number(w.rating).toFixed(1)} · {w.distance_km} km · {w.address}
          </Text>
          <Text style={styles.estimate}>
            Estimasi: {formatRp(w.price_estimate_min ?? 0)} – {formatRp(w.price_estimate_max ?? 0)}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Jenis servis</Text>
        <View style={styles.services}>
          {(detail.data?.services ?? []).map((s) => {
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

        <Text style={styles.sectionTitle}>Pilih slot</Text>
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
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerHint}>
            {service ? service.name : '—'}
            {slot
              ? ` · ${new Date(slot.slot_at).toLocaleString('id-ID', {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : ''}
          </Text>
          <Text style={styles.footerLocked}>{slot ? 'Slot terkunci saat konfirmasi' : 'Pilih slot dulu'}</Text>
        </View>
        <Pressable
          style={[styles.next, (!service || !slot) && styles.nextDisabled]}
          disabled={!service || !slot}
          onPress={() => {
            setWorkshop(w);
            setServiceSlot(service!, slot!);
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  loading: { textAlign: 'center', color: '#98a2b3', marginTop: 48 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 18, fontWeight: '800', color: '#0b1727', flexShrink: 1 },
  ahass: { backgroundColor: '#dc2626', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ahassText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  meta: { marginTop: 4, color: '#667085', fontSize: 13 },
  estimate: { marginTop: 6, color: colors.primary, fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
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
