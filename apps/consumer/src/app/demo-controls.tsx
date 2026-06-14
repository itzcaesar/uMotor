import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { colors, DEMO_BIKE_VARIO_ID, type Motorcycle } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { isConfigured, supabase } from '@/lib/supabase';

/**
 * Presenter-only tools (PRD 01 §8). Reached by long-pressing the profile avatar.
 * Never show this screen on the projector.
 */
export default function DemoControls() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const bikes = useQuery({
    queryKey: ['garage', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('motorcycles').select('*').eq('user_id', userId!);
      return (data ?? []) as Motorcycle[];
    },
  });

  const run = async (key: string, fn: () => Promise<void>, okMsg: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      qc.invalidateQueries();
      Alert.alert('OK', okMsg);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const vario = bikes.data?.find((b) => b.id === DEMO_BIKE_VARIO_ID) ?? bikes.data?.[0];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isConfigured ? colors.accent : colors.danger }]} />
          <Text style={styles.statusText}>
            Supabase: {isConfigured ? 'terkonfigurasi' : 'BELUM dikonfigurasi'}
          </Text>
        </View>
        <Text style={styles.statusHint}>
          Layar ini untuk presenter saja — jangan tampilkan di proyektor.
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Trigger demo</Text>

      <Action
        icon="speedometer"
        title="+500 km odometer (Vario)"
        desc="Memicu notifikasi 80/95/100% saat threshold terlewati"
        busy={busy === 'odo'}
        onPress={() =>
          run(
            'odo',
            async () => {
              if (!vario) throw new Error('Motor demo tidak ditemukan');
              const { error } = await supabase.rpc('advance_odometer', {
                p_motorcycle_id: vario.id,
                p_km: 500,
              });
              if (error) throw error;
            },
            'Odometer +500 km. Cek banner di Garasi.',
          )
        }
      />

      <Action
        icon="notifications"
        title="Kirim notifikasi oli"
        desc="Memunculkan banner perawatan di Garasi (copy sesuai pitch)"
        busy={busy === 'notif'}
        onPress={() =>
          run(
            'notif',
            async () => {
              const { error } = await supabase.from('notifications').insert({
                user_id: userId,
                type: 'maintenance',
                title: 'Waktunya ganti oli',
                body: 'Oli motor D 4821 BJK sudah 80% interval (2.400/3.000 km), masih 600 km lagi. Ganti sekarang atau tunggu?',
              });
              if (error) throw error;
            },
            'Notifikasi terkirim. Buka tab Garasi.',
          )
        }
      />

      <Action
        icon="wallet"
        title="Reset saldo AstraPay → Rp 500.000"
        desc="Isi ulang wallet demo di antara latihan pitch"
        busy={busy === 'wallet'}
        onPress={() =>
          run(
            'wallet',
            async () => {
              const { error } = await supabase
                .from('users')
                .update({ astrapay_balance: 500000 })
                .eq('id', userId!);
              if (error) throw error;
            },
            'Saldo kembali Rp 500.000.',
          )
        }
      />

      <Action
        icon="mail-unread"
        title="Tandai semua notifikasi terbaca"
        desc="Bersihkan banner sebelum mengulang demo"
        busy={busy === 'read'}
        onPress={() =>
          run(
            'read',
            async () => {
              const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', userId!)
                .eq('read', false);
              if (error) throw error;
            },
            'Semua notifikasi ditandai terbaca.',
          )
        }
      />

      <Action
        icon="navigate"
        title="Buka Ride Tracking → Simulasi"
        desc="Putar rute demo di peta langsung (tanpa harus berkendara)"
        busy={false}
        onPress={() => router.push('/ride')}
      />

      <Text style={styles.warn}>
        Reset penuh database: jalankan `pnpm db:reset` di laptop — bukan dari sini.
      </Text>
    </ScrollView>
  );
}

function Action({
  icon,
  title,
  desc,
  busy,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy}>
      <Card style={[styles.action, busy && styles.actionBusy]}>
        <View style={styles.actionIcon}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.actionInfo}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionDesc}>{desc}</Text>
        </View>
        <Ionicons name={busy ? 'hourglass' : 'play'} size={18} color={colors.accent} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  statusCard: { gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontWeight: '700', color: '#0b1727' },
  statusHint: { color: '#98a2b3', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBusy: { opacity: 0.5 },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: { flex: 1, gap: 2 },
  actionTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  actionDesc: { color: '#667085', fontSize: 12, lineHeight: 16 },
  warn: { color: '#98a2b3', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
