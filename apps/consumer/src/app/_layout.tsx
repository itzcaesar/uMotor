import { useEffect } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useRootNavigationState, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@umotor/shared';
import { HeaderBackButton, HeaderCloseButton } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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

  // React Query refetches stale queries when the app returns to foreground —
  // needs explicit AppState wiring on React Native.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f3f6fb' } }}>
        <Stack.Screen name="cart" options={{ presentation: 'modal' }} />
        <Stack.Screen name="booking/new" options={{ headerShown: true, title: 'Pilih Bengkel' }} />
        <Stack.Screen
          name="booking/workshop/[id]"
          options={{ headerShown: true, title: 'Pilih Slot' }}
        />
        <Stack.Screen
          name="booking/confirm"
          options={{ headerShown: true, title: 'Konfirmasi Booking' }}
        />
        <Stack.Screen
          name="booking/[id]"
          options={{
            headerShown: true,
            title: 'Status Booking',
            headerLeft: () => <HeaderBackButton fallback="/(tabs)/bookings" />,
          }}
        />
        <Stack.Screen name="motoscore" options={{ headerShown: true, title: 'MotoScore' }} />
        <Stack.Screen
          name="finance/bill/[id]"
          options={{
            headerShown: true,
            title: 'Detail Tagihan',
            headerLeft: () => <HeaderBackButton fallback="/(tabs)/finance" />,
          }}
        />
        <Stack.Screen
          name="community/[id]"
          options={{
            headerShown: true,
            title: 'Komunitas',
            headerLeft: () => <HeaderBackButton fallback="/(tabs)/community" />,
          }}
        />
        <Stack.Screen
          name="community/post/[id]"
          options={{
            headerShown: true,
            title: 'Postingan',
            headerLeft: () => <HeaderBackButton fallback="/(tabs)/community" />,
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: true, title: 'Notifikasi' }}
        />
        <Stack.Screen name="bike/[id]" options={{ headerShown: true, title: 'Detail Motor' }} />
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
