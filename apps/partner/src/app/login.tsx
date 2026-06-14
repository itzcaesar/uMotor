import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';
import { useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'calendar', title: 'Booking & antrian real-time', sub: 'Inbox dan antrian harian otomatis' },
  { icon: 'qr-code', title: 'Check-in via QR', sub: 'Scan QR pelanggan saat tiba' },
  { icon: 'cash', title: 'Pendapatan harian', sub: 'Pantau omzet dan settlement H+1' },
];

export default function Login() {
  const login = useSession((s) => s.login);
  const [busy, setBusy] = useState(false);
  const r = useResponsive();

  const onLogin = () => {
    setBusy(true);
    setTimeout(() => {
      login();
      router.replace('/(tabs)');
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.container, r.isTablet && styles.containerWide]}>
        {/* Brand hero */}
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Ionicons name="construct" size={34} color="#fff" />
          </View>
          <Text style={styles.logo}>uMotor</Text>
          <View style={styles.mitraBadge}>
            <Text style={styles.mitraText}>MITRA BENGKEL</Text>
          </View>
          <Text style={styles.tagline}>Kelola booking, antrian, dan penjualan bengkel Anda.</Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={colors.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureSub}>{f.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.spacer} />

        {!isConfigured && (
          <Text style={styles.envWarning}>
            Supabase belum dikonfigurasi — salin .env.example ke .env lalu restart Expo.
          </Text>
        )}

        {/* CTAs */}
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={onLogin} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-in" size={18} color="#fff" />
              <Text style={styles.buttonText}>Masuk sebagai Mitra Bengkel</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.push('/signup')}
          disabled={busy}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <Text style={styles.secondaryText}>Daftarkan bengkel Anda</Text>
        </Pressable>
        <Text style={styles.hint}>Demo: masuk sebagai AHASS Bandung Timur</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6fb' },
  container: { flex: 1, padding: 24, paddingTop: 40 },
  containerWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  logo: { fontSize: 36, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
  mitraBadge: {
    backgroundColor: '#e2f6ee',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 2,
  },
  mitraText: { color: '#067647', fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  tagline: { marginTop: 8, fontSize: 14, color: '#667085', textAlign: 'center' },
  features: { marginTop: 32, gap: 12 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8edf5',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e2f6ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: '#0b1727' },
  featureSub: { fontSize: 12, color: '#667085' },
  spacer: { flex: 1 },
  envWarning: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fdf3e3',
    color: '#9a6700',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  secondaryText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  hint: { textAlign: 'center', color: '#98a2b3', fontSize: 12, marginTop: 14 },
});
