import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { astra, figAssets } from '@/components/ui';
import { LoginScene } from '@/components/LoginScene';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

export default function Login() {
  const login = useSession((s) => s.login);
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();

  const onLogin = () => {
    setBusy(true);
    setTimeout(() => {
      login();
      router.replace('/(tabs)');
    }, 1000);
  };

  return (
    <View style={styles.screen}>
      {/* Layered AstraPay-blue blobs + motorbike illustration (Figma login) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.navyBase} />
        <View style={styles.scene}>
          <LoginScene width={width} />
        </View>
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.brand}>
          <Text style={styles.logo}>uMotor</Text>
          <View style={styles.mitraBadge}>
            <Text style={styles.mitraText}>MITRA BENGKEL</Text>
          </View>
          <Text style={styles.tagline}>Satu Ekosistem Semua Kebutuhan Motor</Text>
        </View>

        <View style={styles.spacer} />

        {!isConfigured && (
          <Text style={styles.envWarning}>
            Supabase belum dikonfigurasi — salin .env.example ke .env lalu restart Expo.
          </Text>
        )}

        {/* AstraPay-style login button */}
        <Pressable style={[styles.astraBtn, busy && styles.btnBusy]} onPress={onLogin} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={astra.primary} />
          ) : (
            <>
              <Image source={figAssets.astrapayMark} style={styles.astraLogo} resizeMode="contain" />
              <Text style={styles.astraBtnText}>Masuk dengan AstraPay</Text>
            </>
          )}
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push('/signup')} disabled={busy}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.secondaryText}>Daftarkan bengkel Anda</Text>
        </Pressable>
        <Text style={styles.hint}>Demo: masuk sebagai AHASS Bandung Timur</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: astra.bg, overflow: 'hidden' },
  // Curved navy base + Figma mountains/waves illustration + motorbikes.
  // Flat road-coloured ground panel; the SVG road sits flush on top of it.
  navyBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 232,
    backgroundColor: '#163a6b',
  },
  scene: { position: 'absolute', left: 0, right: 0, bottom: 212 },
  safe: { flex: 1, padding: 28, paddingTop: 56 },
  brand: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 56, fontWeight: '800', color: astra.primary, letterSpacing: -1 },
  mitraBadge: {
    backgroundColor: astra.tile,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  mitraText: { color: astra.primary, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  tagline: { fontSize: 13, color: astra.sub, textAlign: 'center', marginTop: 2 },
  spacer: { flex: 1 },
  envWarning: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fdf3e3',
    color: '#9a6700',
    fontSize: 13,
    textAlign: 'center',
  },
  astraBtn: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#0b1727',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  btnBusy: { opacity: 0.7 },
  astraLogo: { width: 28, height: 25 },
  astraBtnText: { color: astra.primary, fontSize: 18, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 16 },
});
