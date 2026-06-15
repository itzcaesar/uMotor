import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type Slot } from '@umotor/shared';
import { Card, ErrorState, useIsWide } from '@/components/ui';
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
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
    >
      <Text style={styles.intro}>
        Atur kapasitas mekanik & buka/tutup slot. Pelanggan langsung melihat perubahan saat memilih
        jadwal.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((d) => {
          const key = dayKey(d);
          const active = key === day;
          return (
            <Pressable
              key={key}
              style={[styles.dayCard, active && styles.dayActive]}
              onPress={() => setDay(key)}
            >
              <Text style={[styles.dayLabel, active && styles.dayTextActive]}>
                {DAY_LABELS[d.getDay()]}
              </Text>
              <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.getDate()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card style={styles.listCard}>
        {HOURS.map((hour) => {
          const slot = slotForHour(hour);
          const time = `${String(hour).padStart(2, '0')}:00`;
          if (!slot) {
            return (
              <View key={hour} style={styles.hourRow}>
                <Text style={styles.timeClosed}>{time}</Text>
                <Text style={styles.closedLabel}>Tutup</Text>
                <Pressable
                  style={styles.openBtn}
                  disabled={busy}
                  onPress={() => openSlot.mutate(hour)}
                  accessibilityRole="button"
                  accessibilityLabel={`Buka slot ${time}`}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.openText}>Buka</Text>
                </Pressable>
              </View>
            );
          }
          const canReduce = slot.capacity > slot.booked_count;
          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.time}>{time}</Text>
              <View style={styles.capWrap}>
                <Text style={styles.capLabel}>
                  {slot.booked_count}/{slot.capacity} terisi
                </Text>
                <View style={styles.stepper}>
                  <Pressable
                    style={[styles.stepBtn, !canReduce && styles.stepBtnDisabled]}
                    disabled={!canReduce || busy}
                    onPress={() => setCapacity.mutate({ id: slot.id, capacity: slot.capacity - 1 })}
                    accessibilityRole="button"
                    accessibilityLabel="Kurangi kapasitas"
                  >
                    <Ionicons name="remove" size={16} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.capValue}>{slot.capacity}</Text>
                  <Pressable
                    style={styles.stepBtn}
                    disabled={busy}
                    onPress={() => setCapacity.mutate({ id: slot.id, capacity: slot.capacity + 1 })}
                    accessibilityRole="button"
                    accessibilityLabel="Tambah kapasitas"
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
              <Pressable
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
                <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
              </Pressable>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 1000, width: '100%', alignSelf: 'center' },
  intro: { color: '#667085', fontSize: 13, lineHeight: 18 },
  days: { gap: 8, paddingBottom: 4 },
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
  dayActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayLabel: { fontSize: 11, color: '#98a2b3', fontWeight: '600' },
  dayNum: { fontSize: 16, fontWeight: '800', color: '#0b1727' },
  dayTextActive: { color: '#fff' },
  listCard: { gap: 4 },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f4f9',
  },
  time: { width: 52, fontSize: 15, fontWeight: '800', color: '#0b1727' },
  timeClosed: { width: 52, fontSize: 15, fontWeight: '800', color: '#cbd5e1' },
  closedLabel: { flex: 1, color: '#98a2b3', fontSize: 13 },
  capWrap: { flex: 1, gap: 4 },
  capLabel: { color: '#667085', fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    backgroundColor: '#f3f6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  capValue: { minWidth: 18, textAlign: 'center', fontWeight: '800', color: '#0b1727' },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  openText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
