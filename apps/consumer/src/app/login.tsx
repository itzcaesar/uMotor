import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, DEMO_USER_ID, DEMO_USER_PHONE } from '@umotor/shared';
import { useResponsive } from '@/components/ui';
import { ASTRAPAY_LIVE, bindAstraPay } from '@/lib/astrapay';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'speedometer', title: 'Garasi & kesehatan komponen', sub: 'Pantau oli, ban, aki otomatis' },
  { icon: 'trending-up', title: 'MotoScore', sub: 'Skor perawatan buka produk finansial' },
  { icon: 'construct', title: 'Booking servis & sparepart', sub: 'Bengkel terdekat dalam satu app' },
];

export default function Login() {
  const login = useSession((s) => s.login);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = useResponsive();

  const enterApp = () => {
    login();
    router.replace('/(tabs)');
  };

  const onLogin = async () => {
    setBusy(true);
    setError(null);
    // Live: authenticate by binding the real AstraPay wallet (number + OTP 111111
    // + PIN). Success also links the session for tokenized payments. The demo
    // data (garage, MotoScore, bills) stays uMotor's — only the wallet is real.
    if (ASTRAPAY_LIVE) {
      try {
        await bindAstraPay(DEMO_USER_ID, { phone: DEMO_USER_PHONE.replace(/\D/g, '') });
        enterApp();
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : 'Login AstraPay gagal. Coba lagi.');
      }
      return;
    }
    // Mock build: 1s staged loading, then the seeded demo session.
    setTimeout(enterApp, 1000);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.container, r.isTablet && styles.containerWide]}>
        {/* Brand hero */}
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Ionicons name="bicycle" size={36} color="#fff" />
          </View>
          <Text style={styles.logo}>uMotor</Text>
          <Text style={styles.tagline}>Satu Ekosistem. Semua Kebutuhan Motor.</Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={20} color={colors.primary} />
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

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* CTA */}
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={onLogin} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="wallet" size={18} color="#fff" />
              <Text style={styles.buttonText}>Masuk dengan AstraPay</Text>
            </>
          )}
        </Pressable>

        {ASTRAPAY_LIVE && !error && (
          <Text style={styles.loginHint}>Login pakai nomor AstraPay-mu · OTP 111111 + PIN</Text>
        )}

        {error && (
          <Pressable style={styles.skipBtn} onPress={enterApp} disabled={busy}>
            <Text style={styles.skipText}>Lewati — masuk mode demo</Text>
          </Pressable>
        )}

        <Text style={styles.footer}>Prototipe demo · uMotor 2026</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6fb' },
  container: { flex: 1, padding: 24, paddingTop: 24 },
  containerWide: { maxWidth: 480, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  logo: { fontSize: 40, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#667085', textAlign: 'center' },
  features: { marginTop: 40, gap: 12 },
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
    backgroundColor: '#eef4fd',
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
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginHint: { textAlign: 'center', color: '#98a2b3', fontSize: 12, marginTop: 10 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fdecec',
  },
  errorText: { color: colors.danger, fontSize: 13, flexShrink: 1 },
  skipBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  skipText: { color: '#667085', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: '#98a2b3', fontSize: 12, marginTop: 14 },
});
