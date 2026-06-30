import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type Slot } from '@umotor/shared';
import { Card, ErrorState, SectionTitle, astra, useIsWide } from '@/components/ui';
import { GreetingBar } from '@/components/GreetingBar';
import { FadeInView, PressableScale } from '@/components/motion';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

// Local-date key (NOT toISOString — UTC date is yesterday before 07:00 WIB).
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SlotsConfig() {
  const workshopId = useSession((s) => s.workshopId);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [day, setDay] = useState<string>(dayKey(new Date()));

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  const slots = useQuery({
    queryKey: ['slots-config', workshopId],
    enabled: !!workshopId,
    // Booked counts change from the consumer phone; poll as realtime fallback.
    refetchInterval: 15_000,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('slots')
        .select('*')
        .eq('workshop_id', workshopId!)
        .order('slot_at');
      if (error) throw error;
      return (data ?? []) as Slot[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['slots-config', workshopId] });

  // Live sync: a consumer booking bumps booked_count (and the partner Jadwal tab
  // may open/close slots) — reflect both instantly, not just on the 15s poll.
  useEffect(() => {
    if (!workshopId) return;
    const channel = supabase
      .channel(`partner-slots-${workshopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slots', filter: `workshop_id=eq.${workshopId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId]);

  const setCapacity = useMutation({
    mutationFn: async ({ id, capacity }: { id: string; capacity: number }) => {
      const { error } = await supabase.from('slots').update({ capacity }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => notify('Gagal', e.message),
  });

  const openSlot = useMutation({
    mutationFn: async (hour: number) => {
      const at = new Date(`${day}T00:00:00`);
      at.setHours(hour, 0, 0, 0);
      const { error } = await supabase
        .from('slots')
        .insert({ workshop_id: workshopId, slot_at: at.toISOString(), capacity: 1 });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => notify('Gagal', e.message),
  });

  const closeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('slots').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => notify('Gagal', e.message),
  });

  const daySlots = (slots.data ?? []).filter((s) => dayKey(new Date(s.slot_at)) === day);
  const slotForHour = (hour: number) =>
    daySlots.find((s) => new Date(s.slot_at).getHours() === hour) ?? null;
  const busy = setCapacity.isPending || openSlot.isPending || closeSlot.isPending;
  const openCount = daySlots.length;
  const bookedTotal = daySlots.reduce((s, x) => s + x.booked_count, 0);

  if (slots.isError) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ErrorState onRetry={() => slots.refetch()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        wide && styles.contentWide,
      ]}
    >
      <GreetingBar stats />
      {/* Blue-titled intro (Figma "Pilih Slot" section heads) */}
      <SectionTitle sub="Atur kapasitas mekanik & buka/tutup slot. Pelanggan langsung melihat perubahan saat memilih jadwal.">
        Jadwal Servis
      </SectionTitle>

      {/* DATE STRIP — navy-filled active card, white inactive (Figma "Pilih hari") */}
      <Text style={styles.blueTitle}>Pilih hari</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.days}
      >
        {days.map((d, i) => {
          const key = dayKey(d);
          const active = key === day;
          return (
            <FadeInView key={key} index={i}>
              <PressableScale
                style={[styles.dayCard, active && styles.dayActive]}
                onPress={() => setDay(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.dayLabel, active && styles.dayTextActive]}>
                  {DAY_LABELS[d.getDay()]}
                </Text>
                <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.getDate()}</Text>
              </PressableScale>
            </FadeInView>
          );
        })}
      </ScrollView>

      {/* HOURS — clean rows with capacity, stepper, open/close (Figma "Jam operasional") */}
      <View style={styles.hoursHead}>
        <Text style={styles.blueTitle}>Jam operasional</Text>
        <Text style={styles.hoursMeta}>
          {openCount} slot buka · {bookedTotal} terisi
        </Text>
      </View>

      <Card style={styles.listCard}>
        {HOURS.map((hour, i) => {
          const slot = slotForHour(hour);
          const time = `${String(hour).padStart(2, '0')}:00`;
          const isLast = i === HOURS.length - 1;

          if (!slot) {
            return (
              <FadeInView key={hour} index={i} style={[styles.hourRow, isLast && styles.hourRowLast]}>
                <View style={[styles.timeChip, styles.timeChipClosed]}>
                  <Text style={styles.timeTextClosed}>{time}</Text>
                </View>
                <View style={styles.hourMid}>
                  <Text style={styles.closedLabel}>Tutup</Text>
                </View>
                <PressableScale
                  style={[styles.openBtn, busy && styles.btnBusy]}
                  disabled={busy}
                  onPress={() => openSlot.mutate(hour)}
                  accessibilityRole="button"
                  accessibilityLabel={`Buka slot ${time}`}
                >
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={styles.openText}>Buka</Text>
                </PressableScale>
              </FadeInView>
            );
          }

          const canReduce = slot.capacity > slot.booked_count;
          return (
            <FadeInView key={hour} index={i} style={[styles.hourRow, isLast && styles.hourRowLast]}>
              <View style={styles.timeChip}>
                <Text style={styles.timeText}>{time}</Text>
              </View>
              <View style={styles.hourMid}>
                <Text style={styles.capLabel}>
                  {slot.booked_count}/{slot.capacity} terisi
                </Text>
                <View style={styles.stepper}>
                  <PressableScale
                    style={[styles.stepBtn, (!canReduce || busy) && styles.stepBtnDisabled]}
                    disabled={!canReduce || busy}
                    onPress={() => setCapacity.mutate({ id: slot.id, capacity: slot.capacity - 1 })}
                    accessibilityRole="button"
                    accessibilityLabel="Kurangi kapasitas"
                  >
                    <Ionicons name="remove" size={16} color={canReduce ? astra.primary : astra.faint} />
                  </PressableScale>
                  <Text style={styles.capValue}>{slot.capacity}</Text>
                  <PressableScale
                    style={[styles.stepBtn, busy && styles.stepBtnDisabled]}
                    disabled={busy}
                    onPress={() => setCapacity.mutate({ id: slot.id, capacity: slot.capacity + 1 })}
                    accessibilityRole="button"
                    accessibilityLabel="Tambah kapasitas"
                  >
                    <Ionicons name="add" size={16} color={astra.primary} />
                  </PressableScale>
                </View>
              </View>
              <PressableScale
                style={styles.closeBtn}
                disabled={busy}
                onPress={() => {
                  if (slot.booked_count > 0) {
                    notify('Tidak bisa ditutup', 'Slot ini sudah ada booking.');
                    return;
                  }
                  closeSlot.mutate(slot.id);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Tutup slot"
              >
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </PressableScale>
            </FadeInView>
          );
        })}
      </Card>

      <Text style={styles.foot}>
        Kapasitas = jumlah mekanik yang bisa menangani jam tersebut. Slot dengan booking tidak bisa
        ditutup.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },

  // Blue section titles (Figma "Pilih hari" / "Jam operasional")
  blueTitle: { fontSize: 15, fontWeight: '800', color: astra.primary },

  // DATE STRIP
  days: { gap: 10, paddingBottom: 4, paddingRight: 4 },
  dayCard: {
    width: 64,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: astra.line,
    alignItems: 'center',
    gap: 4,
  },
  dayActive: { backgroundColor: astra.primary, borderColor: astra.primary },
  dayLabel: { fontSize: 12, color: astra.faint, fontWeight: '700' },
  dayTextActive: { color: '#dbe9ff' },
  dayNum: { fontSize: 22, fontWeight: '800', color: astra.ink },
  dayNumActive: { color: '#fff' },

  // HOURS
  hoursHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hoursMeta: { fontSize: 12, color: astra.sub, fontWeight: '600' },
  listCard: { padding: 0, overflow: 'hidden' },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f4f9',
  },
  hourRowLast: { borderBottomWidth: 0 },

  // Time chip (left)
  timeChip: {
    width: 58,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: astra.tile,
    alignItems: 'center',
  },
  timeChipClosed: { backgroundColor: '#f3f6fb', borderWidth: 1, borderColor: astra.line },
  timeText: { fontSize: 14, fontWeight: '800', color: astra.primary },
  timeTextClosed: { fontSize: 14, fontWeight: '800', color: astra.faint },

  // Middle (capacity + stepper, or "Tutup")
  hourMid: { flex: 1, gap: 6 },
  closedLabel: { color: astra.faint, fontSize: 13, fontWeight: '600' },
  capLabel: { color: astra.sub, fontSize: 12, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#bcd8ff',
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  capValue: { minWidth: 20, textAlign: 'center', fontWeight: '800', fontSize: 16, color: astra.ink },

  // Open button (blue) + close button (red icon)
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: astra.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  closeBtn: { alignItems: 'center', justifyContent: 'center' },
  btnBusy: { opacity: 0.6 },

  foot: { color: astra.faint, fontSize: 11, lineHeight: 16, paddingHorizontal: 2 },
});
