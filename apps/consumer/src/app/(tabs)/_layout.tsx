import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';

/**
 * Figma 5-tab layout: Beranda · Garasi · Finance · Notification · Akun.
 * Sparepart (marketplace), Booking, and Komunitas stay reachable as routes
 * (entered from Beranda tiles / Akun) but are hidden from the tab bar.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...(props as unknown as Parameters<typeof TabBar>[0])} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      <Tabs.Screen name="garasi" options={{ title: 'Garasi' }} />
      <Tabs.Screen name="finance" options={{ title: 'Finance' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notification' }} />
      <Tabs.Screen name="profile" options={{ title: 'Akun' }} />

      {/* Reachable routes that are not tabs */}
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="community" options={{ href: null }} />
    </Tabs>
  );
}
