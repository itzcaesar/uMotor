import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '@umotor/shared';
import { astra } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type IconName = keyof typeof Ionicons.glyphMap;
const TAB_SPRING = { mass: 0.5, damping: 13, stiffness: 220 } as const;

/** Tab-bar icon that springs (scale + lift) when its tab becomes active. */
function AnimatedTabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const reduced = useReducedMotion();
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = focused ? 1 : 0;
  }, [focused, active]);

  const style = useAnimatedStyle(() => {
    const v = reduced ? (focused ? 1 : 0) : active.value;
    return { transform: [{ scale: withSpring(1 + v * 0.18, TAB_SPRING) }, { translateY: withSpring(-v * 2, TAB_SPRING) }] };
  });

  return (
    <Animated.View style={style}>
      <Ionicons name={name} color={color} size={23} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const workshopId = useSession((s) => s.workshopId);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

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
        headerShown: false,
        tabBarActiveTintColor: astra.primary,
        tabBarInactiveTintColor: astra.inactive,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 10 },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 8) + 6,
          height: 70,
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: 18,
          borderTopWidth: 0,
          backgroundColor: '#ffffff',
          shadowColor: '#0b1727',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 14,
        },
        tabBarItemStyle: { paddingVertical: 8 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inbox',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="mail" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Antrian',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="list" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Sparepart',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="cube" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="slots"
        options={{
          title: 'Jadwal',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Pendapatan',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="cash" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
