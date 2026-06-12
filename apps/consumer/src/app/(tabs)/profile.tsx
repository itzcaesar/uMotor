import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, formatRp, type MotoScore, type User } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { userId, logout } = useSession();

  const profile = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [u, s, p] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId!).single(),
        supabase.from('motoscore').select('*').eq('user_id', userId!).single(),
        supabase.from('points').select('*').eq('user_id', userId!).single(),
      ]);
      return {
        user: u.data as User | null,
        score: s.data as MotoScore | null,
        points: (p.data as { balance: number } | null)?.balance ?? 0,
      };
    },
  });

  const d = profile.data;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.name}>{d?.user?.name ?? '…'}</Text>
        <Text style={styles.phone}>{d?.user?.phone ?? ''}</Text>
        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>Saldo AstraPay</Text>
          <Text style={styles.walletValue}>
            {d?.user ? formatRp(d.user.astrapay_balance) : '—'}
          </Text>
        </View>
      </Card>

      <Card style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>MotoScore</Text>
        <Text style={styles.scoreValue}>{d?.score?.score ?? '—'}</Text>
        <Text style={styles.scoreHint}>300–850 · dari perilaku perawatan motor</Text>
      </Card>

      <Card>
        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>MotoPoints</Text>
          <Text style={styles.pointsValue}>{d?.points.toLocaleString('id-ID') ?? '—'}</Text>
        </View>
      </Card>

      <Pressable
        style={styles.logout}
        onPress={() => {
          logout();
          router.replace('/login');
        }}
      >
        <Text style={styles.logoutText}>Keluar</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  name: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  phone: { color: '#667085', marginTop: 2 },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  walletLabel: { color: '#667085' },
  walletValue: { fontWeight: '800', fontSize: 16, color: colors.primary },
  scoreCard: { alignItems: 'center', paddingVertical: 24 },
  scoreLabel: { color: '#667085', fontWeight: '600' },
  scoreValue: { fontSize: 56, fontWeight: '800', color: colors.accent, marginTop: 4 },
  scoreHint: { fontSize: 12, color: '#98a2b3', marginTop: 4 },
  pointsValue: { fontWeight: '800', fontSize: 16, color: '#0b1727' },
  logout: { alignItems: 'center', padding: 14 },
  logoutText: { color: colors.danger, fontWeight: '700' },
});
