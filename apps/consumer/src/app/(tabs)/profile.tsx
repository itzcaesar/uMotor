import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp, type MotoScore, type User } from '@umotor/shared';
import { Illustration } from '@/components/Illustration';
import { umotor, useResponsive } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const astrapayMark = require('../../../assets/figma/astrapay-mark.png');

export default function Profile() {
  const { userId, logout } = useSession();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }, r.isTablet && styles.contentWide]}
    >
      <Text style={styles.header}>Profile</Text>

      {/* Identity card */}
      <Pressable style={styles.idCard} onLongPress={() => router.push('/demo-controls')} delayLongPress={600}>
        <View style={styles.idCopy}>
          <Text style={styles.username} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            {d?.user?.name ?? '…'}
          </Text>
          <Text style={styles.phone}>{d?.user?.phone ?? ''}</Text>
        </View>
        <View style={[styles.idIllus, { pointerEvents: 'none' }]}>
          <Illustration name="profile" height={84} />
        </View>
        <View style={styles.idStrip} />
      </Pressable>

      <Text style={styles.sectionTitle}>Kantong & Score</Text>

      {/* AstraPay + Moto Points */}
      <View style={styles.row2}>
        <Pressable style={[styles.miniCard, { backgroundColor: umotor.heroMid }]} onPress={() => router.push('/finance')}>
          <Image source={astrapayMark} style={styles.watermark} contentFit="contain" tintColor="#fff" />
          <View style={styles.miniTop}>
            <Image source={astrapayMark} style={{ width: 34, height: 30 }} contentFit="contain" tintColor={'#fff'} />
            <Text style={styles.miniAction}>Lihat pengeluaran ›</Text>
          </View>
          <Text style={styles.miniLabel}>AstraPay</Text>
          <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {d?.user ? formatRp(d.user.astrapay_balance) : '—'}
          </Text>
        </Pressable>
        <Pressable style={[styles.miniCard, { backgroundColor: umotor.heroDark }]} onPress={() => notify('Tukar Points', 'Penukaran MotoPoints segera hadir.')}>
          <View style={styles.miniTop}>
            <View style={{ flex: 1 }} />
            <Text style={styles.miniAction}>Tukar Points ›</Text>
          </View>
          <Text style={styles.miniLabel}>Moto Points</Text>
          <Text style={styles.miniValue}>{d?.points.toLocaleString('id-ID') ?? '—'}</Text>
        </Pressable>
      </View>

      {/* Moto Score */}
      <Pressable style={styles.scoreCard} onPress={() => router.push('/motoscore')}>
        <View style={styles.scoreTop}>
          <Text style={styles.scoreLabel}>Moto Score</Text>
          <Text style={styles.scoreAction}>Ketuk untuk detail & produk finansial ›</Text>
        </View>
        <Text style={styles.scoreValue}>
          {d?.score?.score ?? '—'}
          <Text style={styles.scoreUnit}>pt</Text>
        </Text>
      </Pressable>

      {/* Need help */}
      <Text style={styles.needHelp}>Need Help?</Text>
      <View style={styles.helpRow}>
        <Pressable style={styles.helpBtn} onPress={() => notify('Bantuan', 'Pusat bantuan uMotor segera hadir.')}>
          <Ionicons name="headset-outline" size={20} color={umotor.heroDark} />
        </Pressable>
        <Pressable style={styles.helpBtn} onPress={() => notify('Chat', 'Live chat segera hadir.')}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={umotor.heroDark} />
        </Pressable>
      </View>

      <Pressable style={styles.logout} onPress={() => { logout(); router.replace('/login'); }}>
        <Ionicons name="exit-outline" size={16} color="#e0543f" />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: umotor.bg },
  content: { paddingHorizontal: 18, gap: 14 },
  contentWide: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { fontSize: 22, fontWeight: '800', color: umotor.heroDark },

  idCard: { backgroundColor: '#d0e4ff', borderRadius: 18, padding: 18, paddingBottom: 26, flexDirection: 'row', overflow: 'hidden', minHeight: 110 },
  idCopy: { flex: 1, minWidth: 0, paddingRight: 106, zIndex: 1 },
  username: { fontSize: 22, lineHeight: 26, fontWeight: '800', color: umotor.heroDark },
  phone: { fontSize: 13, color: 'rgba(28,78,147,0.55)', marginTop: 4 },
  idIllus: { position: 'absolute', right: 8, top: 10 },
  idStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, backgroundColor: umotor.heroDark },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: umotor.heroDark },
  row2: { flexDirection: 'row', gap: 14 },
  miniCard: { flex: 1, borderRadius: 16, padding: 16, height: 180, justifyContent: 'space-between', overflow: 'hidden' },
  watermark: { position: 'absolute', right: -18, bottom: -20, width: 152, height: 140, opacity: 0.13, filter: 'blur(3px)' },
  miniTop: { flexDirection: 'row', alignItems: 'center' },
  miniAction: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '400', marginLeft: 'auto' },
  miniLabel: { color: '#fff', fontSize: 20, fontWeight: '400', marginTop: 'auto' },
  miniValue: { color: '#fff', fontSize: 15, fontWeight: '400', marginTop: 2 },

  scoreCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  scoreTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scoreLabel: { fontSize: 16, fontWeight: '700', color: umotor.heroMid },
  scoreAction: { fontSize: 11, fontWeight: '400', color: umotor.heroMid, flexShrink: 1, textAlign: 'right' },
  scoreValue: { fontSize: 104, lineHeight: 104, fontWeight: '800', color: '#5b9bf0', marginTop: 4 },
  scoreUnit: { fontSize: 40, fontWeight: '800', color: '#5b9bf0' },

  needHelp: { textAlign: 'center', color: umotor.faint, fontSize: 13, marginTop: 6 },
  helpRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  helpBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#cfe0f7', alignItems: 'center', justifyContent: 'center' },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#e6ecf5', borderRadius: 14, paddingVertical: 15, marginTop: 8, alignSelf: 'center', paddingHorizontal: 48 },
  logoutText: { color: '#e0543f', fontWeight: '700', fontSize: 15 },
});
