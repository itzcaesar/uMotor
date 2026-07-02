import { useEffect, useState } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useRootNavigationState, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';
import { colors } from '@umotor/shared';
import { CRITICAL_IMAGES } from '@/lib/preload';
import { useSession } from '@/lib/session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

// Hold the native splash until fonts, the Ionicons glyph font, and first-paint
// images are ready, so the first frame is fully painted — no icon pop-in.
SplashScreen.preventAutoHideAsync().catch(() => {});
try {
  SplashScreen.setOptions({ duration: 220, fade: true });
} catch {
  // setOptions is a no-op on platforms that don't support it.
}

// ── Global Nunito (Figma uses a rounded face) ──────────────────────────────
// Custom fonts don't synthesize weights, so map each fontWeight to the matching
// Nunito family and inject it into every <Text>/<TextInput> render once.
const NUNITO: Record<string, string> = {
  '100': 'Nunito_400Regular',
  '200': 'Nunito_400Regular',
  '300': 'Nunito_400Regular',
  '400': 'Nunito_400Regular',
  normal: 'Nunito_400Regular',
  '500': 'Nunito_500Medium',
  '600': 'Nunito_600SemiBold',
  '700': 'Nunito_700Bold',
  bold: 'Nunito_700Bold',
  '800': 'Nunito_800ExtraBold',
  '900': 'Nunito_800ExtraBold',
};
let fontsPatched = false;
function patchTextFonts() {
  if (fontsPatched) return;
  fontsPatched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const Comp of [Text, TextInput] as unknown as Array<{ render?: (...a: any[]) => any }>) {
    const orig = Comp.render;
    if (typeof orig !== 'function') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Comp.render = function (props: any, ref: any) {
      const flat = (StyleSheet.flatten(props?.style) ?? {}) as { fontWeight?: string | number };
      const fam = NUNITO[String(flat.fontWeight ?? '400')] ?? 'Nunito_400Regular';
      return orig.call(this, { ...props, style: [{ fontFamily: fam }, props?.style] }, ref);
    };
  }
}
patchTextFonts();

/**
 * Demo-day crash guard: an unexpected render error shows a branded retry
 * screen instead of the red dev overlay / white screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errScreen}>
      <Text style={styles.errTitle}>Terjadi kesalahan</Text>
      <Text style={styles.errBody}>{error.message}</Text>
      <Pressable style={styles.errBtn} onPress={retry}>
        <Text style={styles.errBtnText}>Muat ulang</Text>
      </Pressable>
    </View>
  );
}

// Auth gate: the Zustand session is not persisted, so a web reload / deep-link
// entry lands inside (tabs) with workshopId=null and every query stays disabled.
// Bounce to /login when logged out; bounce away from /login when logged in.
function useAuthGuard() {
  const workshopId = useSession((s) => s.workshopId);
  const segments = useSegments();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    const first = segments[0];
    const onAuthRoute = first === 'login' || first === 'signup';
    if (!workshopId && !onAuthRoute) {
      router.replace('/login');
    } else if (workshopId && first === 'login') {
      router.replace('/(tabs)');
    }
  }, [workshopId, segments, navState?.key]);
}

export default function RootLayout() {
  useAuthGuard();
  const [fontsLoaded] = useFonts({
    Nunito_400Regular: require('../../assets/fonts/Nunito-400.ttf'),
    Nunito_500Medium: require('../../assets/fonts/Nunito-500.ttf'),
    Nunito_600SemiBold: require('../../assets/fonts/Nunito-600.ttf'),
    Nunito_700Bold: require('../../assets/fonts/Nunito-700.ttf'),
    Nunito_800ExtraBold: require('../../assets/fonts/Nunito-800.ttf'),
    // Preload the Ionicons glyph font so every icon paints on the first frame.
    ...Ionicons.font,
  });

  // Warm the decode cache for first-paint images. Bounded by a 2s timeout so a
  // slow/failed asset can never hold the splash hostage.
  const [assetsReady, setAssetsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setAssetsReady(true);
    };
    const timer = setTimeout(finish, 2000);
    Asset.loadAsync(CRITICAL_IMAGES)
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const appReady = fontsLoaded && assetsReady;

  // Reveal the painted UI and fade the splash only once everything is ready.
  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  // React Query refetches stale queries when the app returns to foreground —
  // needs explicit AppState wiring on React Native.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  if (!appReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#f3f6fb' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Daftar Bengkel' }} />
        <Stack.Screen
          name="sparepart-new"
          options={{ title: 'Jual Sparepart', presentation: 'modal' }}
        />
        <Stack.Screen name="kelola-sparepart" options={{ title: 'Kelola Etalase' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Detail Booking' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan QR Check-in', presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ title: 'Kelola Bengkel' }} />
      </Stack>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  errScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: '#f3f6fb',
  },
  errTitle: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  errBody: { color: '#667085', textAlign: 'center', fontSize: 13 },
  errBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  errBtnText: { color: '#fff', fontWeight: '700' },
});
