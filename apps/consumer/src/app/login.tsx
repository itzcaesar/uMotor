import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Ellipse } from 'react-native-svg';
import { DEMO_USER_ID, DEMO_USER_PHONE } from '@umotor/shared';
import { Illustration } from '@/components/Illustration';
import { umotor, useResponsive } from '@/components/ui';
import { ASTRAPAY_LIVE, bindAstraPay, isAstraPayBound } from '@/lib/astrapay';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

const astrapayMark = require('../../assets/figma/astrapay-mark.png');

// Figma frame is 402 × 874; lay everything out on that canvas, scaled to the
// device width (the design aspect ratio matches modern phones almost exactly).
const FW = 402;
const FH = 874;

export default function Login() {
  const login = useSession((s) => s.login);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = useResponsive();

  const sceneW = Math.min(r.width, 460);
  const s = sceneW / FW;
  const sceneH = FH * s;

  const enterApp = () => {
    login();
    router.replace('/(tabs)');
  };

  const onLogin = async () => {
    setBusy(true);
    setError(null);
    // Offline-dev escape only (EXPO_PUBLIC_ASTRAPAY_LIVE=0) — no demo bypass ships.
    if (!ASTRAPAY_LIVE) {
      enterApp();
      return;
    }
    // Strict AstraPay login: a returning, already-linked wallet enters instantly;
    // otherwise the user MUST complete the real AstraPay binding (number + OTP
    // 111111 + PIN). Closing the webview leaves them on the login screen.
    try {
      if (await isAstraPayBound(DEMO_USER_ID)) {
        enterApp();
        return;
      }
      const { walletBound, completed } = await bindAstraPay(DEMO_USER_ID, {
        phone: DEMO_USER_PHONE.replace(/\D/g, ''),
      });
      if (walletBound || completed) {
        enterApp();
        return;
      }
      setBusy(false);
      setError('Verifikasi AstraPay belum selesai. Selesaikan login AstraPay untuk masuk.');
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Login AstraPay gagal. Coba lagi.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={[styles.canvas, { width: sceneW, height: sceneH }]}>
        {/* ── Bottom wave layers (three big overlapping ellipses) ── */}
        <Svg
          width={sceneW}
          height={sceneH}
          viewBox={`0 0 ${FW} ${FH}`}
          style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
        >
          {/* back-left + back-right bright arcs, then the deep front base */}
          <Ellipse cx={-71} cy={896} rx={358} ry={347} fill="#3a83e8" />
          <Ellipse cx={478} cy={953} rx={358} ry={347} fill="#3a83e8" />
          <Ellipse cx={191.5} cy={1151} rx={543.5} ry={527} fill={umotor.primary} />
        </Svg>

        {/* ── Landscape backdrop (mountains / clouds / road) ── */}
        <View style={{ position: 'absolute', left: -71 * s, top: 245 * s, pointerEvents: 'none' }}>
          <Illustration name="loginLandscape" width={533 * s} />
        </View>

        {/* ── Riders (same scooter asset, both tilted 13.56°) ── */}
        <View
          style={{
            position: 'absolute',
            left: -51 * s,
            top: 413 * s,
            width: 196 * s,
            height: 121 * s,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '13.56deg' }],
            pointerEvents: 'none',
          }}
        >
          <Illustration name="biker" width={182 * s} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: 183 * s,
            top: 461 * s,
            width: 302 * s,
            height: 186 * s,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '13.56deg' }],
            pointerEvents: 'none',
          }}
        >
          <Illustration name="biker" width={281 * s} />
        </View>

        {/* ── Brand wordmark + tagline ── */}
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 120 * s, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ fontSize: 80 * s, lineHeight: 90 * s, fontWeight: '800', color: umotor.primary, letterSpacing: -1 }}>
            uMotor
          </Text>
          <Text style={{ fontSize: 13 * s, fontWeight: '500', color: '#a6a6a6', marginTop: 4 * s }}>
            Satu Ekosistem Semua Kebutuhan Motor
          </Text>
        </View>

        {/* ── Status messages (above the button) ── */}
        <View style={{ position: 'absolute', left: 30 * s, right: 30 * s, bottom: 150 * s, gap: 8 }}>
          {!isConfigured && (
            <Text style={styles.envWarning}>
              Supabase belum dikonfigurasi — salin .env.example ke .env lalu restart Expo.
            </Text>
          )}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#fff" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {ASTRAPAY_LIVE && !error && (
            <Text style={styles.loginHint}>Login pakai nomor AstraPay-mu · OTP 111111 + PIN</Text>
          )}
        </View>

        {/* ── CTA button ── */}
        <Pressable
          style={[
            styles.button,
            { left: 30 * s, right: 30 * s, bottom: 72 * s, height: 73 * s, borderRadius: 16 * s },
            busy && styles.buttonBusy,
          ]}
          onPress={onLogin}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Masuk dengan AstraPay"
        >
          {busy ? (
            <ActivityIndicator color={umotor.primary} />
          ) : (
            <View style={styles.buttonInner}>
              <Image source={astrapayMark} style={{ width: 34 * s, height: 30 * s }} contentFit="contain" />
              <Text style={[styles.buttonText, { fontSize: 22 * s }]}>Masuk dengan AstraPay</Text>
            </View>
          )}
        </Pressable>

        {!error && (
          <Text style={[styles.footer, { bottom: 38 * s }]}>Apex Capital, uMotor 2026.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: umotor.bg, alignItems: 'center', justifyContent: 'flex-end' },
  canvas: { overflow: 'hidden', position: 'relative' },
  button: {
    position: 'absolute',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 6px 12px rgba(11,23,39,0.12)',
    elevation: 4,
  },
  buttonBusy: { opacity: 0.85 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttonText: { color: umotor.primary, fontWeight: '800' },
  envWarning: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fdf3e3',
    color: '#9a6700',
    fontSize: 12,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(203,90,78,0.92)',
  },
  errorText: { color: '#fff', fontSize: 13, flexShrink: 1 },
  loginHint: { textAlign: 'center', color: '#ffffff', opacity: 0.85, fontSize: 12 },
  footer: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },
});
