import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { colors } from '@umotor/shared';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function TabsLayout() {
  const workshopId = useSession((s) => s.workshopId);
  const qc = useQueryClient();

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
          qc.invalidateQueries({ queryKey: ['queue'] });
          qc.invalidateQueries({ queryKey: ['booking'] });
          qc.invalidateQueries({ queryKey: ['earnings'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workshopId, qc]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inbox',
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
        name="earnings"
        options={{
          title: 'Pendapatan',
          tabBarIcon: ({ color, size }) => <Ionicons name="cash" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
