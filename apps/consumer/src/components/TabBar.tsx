import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from './motion';
import { umotor } from './ui';

// Minimal shape of the props expo-router passes to a custom `tabBar` (the full
// @react-navigation/bottom-tabs type isn't resolvable as a direct dep).
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: { emit: (...a: any[]) => { defaultPrevented?: boolean }; navigate: (name: string) => void };
}

// Figma bottom nav: Beranda · Garasi · Finance · Notification · Akun.
// Active = brand blue, inactive = #b0b0b0. Icons are the Figma line-icon PNGs,
// recoloured with tintColor.
const TABS = [
  { name: 'index', label: 'Beranda', icon: require('../../assets/figma/nav-home.png') },
  { name: 'garasi', label: 'Garasi', icon: require('../../assets/figma/nav-motorcycle.png') },
  { name: 'finance', label: 'Finance', icon: require('../../assets/figma/ic-coins.png') },
  { name: 'notifications', label: 'Notification', icon: require('../../assets/figma/nav-notification.png') },
  { name: 'profile', label: 'Akun', icon: require('../../assets/figma/nav-profile.png') },
] as const;

const SPRING = { mass: 0.5, damping: 14, stiffness: 220 } as const;

/** Bottom-nav item whose icon springs up + scales when it becomes active. */
function TabItem({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: number;
  focused: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = focused ? 1 : 0;
  }, [focused, active]);

  const iconStyle = useAnimatedStyle(() => {
    const v = reduced ? (focused ? 1 : 0) : active.value;
    return {
      transform: [
        { scale: withSpring(1 + v * 0.16, SPRING) },
        { translateY: withSpring(-v * 3, SPRING) },
      ],
    };
  });

  const dotStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active.value, { duration: 180 }),
    transform: [{ scale: withSpring(active.value, SPRING) }],
  }));

  const color = focused ? umotor.primary : umotor.inactive;

  return (
    <PressableScale
      style={styles.item}
      onPress={onPress}
      dim={false}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
    >
      <Animated.View style={iconStyle}>
        <Image source={icon} style={styles.icon} tintColor={color} />
      </Animated.View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={[styles.dot, dotStyle]} />
    </PressableScale>
  );
}

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;

  return (
    <View style={[styles.dock, { marginBottom: Math.max(insets.bottom, 10) + 4 }]}>
      {TABS.map((t) => {
        const focused = activeRoute === t.name;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: t.name, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(t.name);
        };
        return <TabItem key={t.name} label={t.label} icon={t.icon} focused={focused} onPress={onPress} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Floating dock — rounded pill that hovers above the bottom edge.
  dock: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 14,
    borderRadius: 26,
    height: 66,
    alignItems: 'center',
    paddingHorizontal: 6,
    boxShadow: '0px 6px 16px rgba(11,23,39,0.16)',
    elevation: 16,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  icon: { width: 26, height: 26 },
  label: { fontSize: 10.5, fontWeight: '600' },
  dot: {
    position: 'absolute',
    bottom: -6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: umotor.primary,
  },
});
