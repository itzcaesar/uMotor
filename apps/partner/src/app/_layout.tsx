import { useEffect } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@umotor/shared';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
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

export default function RootLayout() {
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
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#f3f6fb' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Daftar Bengkel' }} />
        <Stack.Screen
          name="sparepart-new"
          options={{ title: 'Jual Sparepart', presentation: 'modal' }}
        />
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
