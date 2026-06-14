import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { colors } from '@umotor/shared';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function TabsLayout() {
  const workshopId = useSession((s) => s.workshopId);
  const qc = useQueryClient();

  // Pending-booking count drives the Inbox tab badge so the presenter sees new
  // work land without opening the tab. Realtime + polling keep it fresh.
  const pending = useQuery({
    queryKey: ['inbox-count', workshopId],
    enabled: !!workshopId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('workshop_id', workshopId!)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
  const pendingCount = pending.data ?? 0;

  // Inbox subscription lives at app level, not screen level (PRD 02 §4.2):
  // the new-booking buzz must fire even while the presenter is on another tab.
  useEffect(() => {
    if (!workshopId) return;
    const channel = supabase
      .channel('partner-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `workshop_id=eq.${workshopId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          qc.invalidateQueries({ queryKey: ['inbox'] });
          qc.invalidateQueries({ queryKey: ['inbox-count'] });
          qc.invalidateQueries({ queryKey: ['queue'] });
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['booking'] });
          qc.invalidateQueries({ queryKey: ['earnings'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workshopId, qc]);

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inbox',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
          tabBarIcon: ({ color, size }) => <Ionicons name="mail" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Antrian',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Sparepart',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="slots"
        options={{
          title: 'Jadwal',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Pendapatan',
          tabBarIcon: ({ color, size }) => <Ionicons name="cash" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
