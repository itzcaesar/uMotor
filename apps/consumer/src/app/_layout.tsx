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

// ── Global SF Pro Display (the Figma typeface) ─────────────────────────────
// Only 3 upright weights ship (Regular/Medium/Bold); custom fonts don't
// synthesize, so map each fontWeight to the nearest face and inject it into
// every <Text>/<TextInput> render once.
const SF: Record<string, string> = {
  '100': 'SFProDisplay-Regular',
  '200': 'SFProDisplay-Regular',
  '300': 'SFProDisplay-Regular',
  '400': 'SFProDisplay-Regular',
  normal: 'SFProDisplay-Regular',
  '500': 'SFProDisplay-Medium',
  '600': 'SFProDisplay-Medium',
  '700': 'SFProDisplay-Bold',
  bold: 'SFProDisplay-Bold',
  '800': 'SFProDisplay-Bold',
  '900': 'SFProDisplay-Bold',
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
      const fam = SF[String(flat.fontWeight ?? '400')] ?? 'SFProDisplay-Regular';
      return orig.call(this, { ...props, style: [{ fontFamily: fam }, props?.style] }, ref);
    };
  }
}
patchTextFonts();
import { AstraPayBrowserHost } from '@/components/AstraPayBrowser';
import { HeaderBackButton, HeaderCloseButton } from '@/components/ui';
import { CRITICAL_IMAGES } from '@/lib/preload';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Keep the native splash up until fonts, the Ionicons glyph font, and the
// first-paint images are all ready — so the first frame is fully painted
// (text + icons + tiles) with no progressive pop-in. Bounded below so a slow
// asset can never hang startup.
SplashScreen.preventAutoHideAsync().catch(() => {});
try {
  SplashScreen.setOptions({ duration: 220, fade: true });
} catch {
  // setOptions is a no-op on platforms that don't support it.
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

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

/**
 * App-level notifications subscription: keeps the Garasi banner, the header
 * bell badge, and the notifications screen in sync no matter which screen
 * inserted/updated rows (RPCs, demo controls, partner completing a service).
 */
function useNotificationsLive() {
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('consumer-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
          queryClient.invalidateQueries({ queryKey: ['notif-unread', userId] });
          queryClient.invalidateQueries({ queryKey: ['maintenance-banner', userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}

/**
 * Auth gate: redirect to /login whenever a protected route is reached while
 * logged out (cold start, dev reload restoring the last route, or a deep link),
 * and bounce a logged-in user away from /login. Without this, only `index`
 * checked auth, so a reload landing on e.g. /cart bypassed the login screen.
 */
function useAuthGuard() {
  const userId = useSession((s) => s.userId);
  const segments = useSegments();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return; // wait until the navigator is mounted
    const onLogin = segments[0] === 'login';
    if (!userId && !onLogin) {
      router.replace('/login');
    } else if (userId && onLogin) {
      router.replace('/(tabs)');
    }
  }, [userId, segments, navState?.key]);
}

export default function RootLayout() {
  useAuthGuard();
  useNotificationsLive();

  const [fontsLoaded] = useFonts({
    'SFProDisplay-Regular': require('../../assets/fonts/SFProDisplay-Regular.otf'),
    'SFProDisplay-Medium': require('../../assets/fonts/SFProDisplay-Medium.otf'),
    'SFProDisplay-Bold': require('../../assets/fonts/SFProDisplay-Bold.otf'),
    // Preload the Ionicons glyph font so every icon paints on the first frame
    // instead of popping in once the font streams in on demand.
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f3f6fb' } }}>
        <Stack.Screen name="cart" options={{ presentation: 'modal' }} />
        <Stack.Screen name="booking/new" options={{ headerShown: false }} />
        <Stack.Screen name="booking/workshop/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="booking/confirm" options={{ headerShown: false }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="motoscore" options={{ headerShown: false }} />
        <Stack.Screen name="finance/bill/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: true, title: 'Notifikasi' }}
        />
        <Stack.Screen name="bike/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="bbm" options={{ headerShown: false }} />
        <Stack.Screen name="bengkel" options={{ headerShown: false }} />
        <Stack.Screen name="marketplace" options={{ headerShown: false }} />
        <Stack.Screen
          name="ride/index"
          options={{
            headerShown: true,
            title: 'Ride Tracking',
            headerLeft: () => <HeaderBackButton fallback="/(tabs)" />,
          }}
        />
        <Stack.Screen
          name="ride/[id]"
          options={{
            headerShown: true,
            title: 'Ringkasan Ride',
            headerLeft: () => <HeaderBackButton fallback="/ride" />,
          }}
        />
        <Stack.Screen
          name="add-bike"
          options={{
            headerShown: true,
            title: 'Tambah Motor',
            presentation: 'modal',
            headerLeft: () => <HeaderCloseButton />,
          }}
        />
        <Stack.Screen
          name="demo-controls"
          options={{
            headerShown: true,
            title: 'Demo Controls',
            presentation: 'modal',
            headerLeft: () => <HeaderCloseButton />,
          }}
        />
      </Stack>
      {/* In-app AstraPay WebView (binding + payment) — never leaves the app. */}
      <AstraPayBrowserHost />
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
    backgroundColor: '#0e4da4',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  errBtnText: { color: '#fff', fontWeight: '700' },
});
