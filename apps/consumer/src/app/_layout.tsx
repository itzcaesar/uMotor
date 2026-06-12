import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

export default function RootLayout() {
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
        <Stack.Screen name="booking/[id]" options={{ headerShown: true, title: 'Status Booking' }} />
        <Stack.Screen name="motoscore" options={{ headerShown: true, title: 'MotoScore' }} />
        <Stack.Screen name="bike/[id]" options={{ headerShown: true, title: 'Detail Motor' }} />
        <Stack.Screen
          name="add-bike"
          options={{ headerShown: true, title: 'Tambah Motor', presentation: 'modal' }}
        />
        <Stack.Screen
          name="demo-controls"
          options={{ headerShown: true, title: 'Demo Controls', presentation: 'modal' }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
