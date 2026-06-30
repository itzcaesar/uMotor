import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ── Shared motion primitives (Reanimated 4, UI-thread) ─────────────────────
// All animation runs on the UI thread via worklets, and only animates
// transform/opacity (compositor-friendly). Reanimated layout animations
// (`entering`) respect the OS "reduce motion" setting automatically; the
// press-scale below opts out explicitly via `useReducedMotion`.

export { FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition };
export const MotionView = Animated.View;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Snappy, slightly under-damped spring — quick press-in, soft release.
const PRESS_SPRING = { mass: 0.4, damping: 12, stiffness: 260 } as const;

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Target scale while pressed (default 0.96). */
  scale?: number;
  /** Dim slightly while pressed (default true). */
  dim?: boolean;
};

/**
 * Drop-in replacement for `Pressable` that scales/dims on press for tactile
 * feedback. Transforms don't reflow layout, so this is a free visual upgrade.
 */
export function PressableScale({
  children,
  style,
  scale = 0.96,
  dim = true,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const target = reduced ? 1 : 1 - pressed.value * (1 - scale);
    return {
      transform: [{ scale: withSpring(target, PRESS_SPRING) }],
      opacity: dim ? withTiming(1 - pressed.value * 0.12, { duration: 90 }) : 1,
    };
  });

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = 1;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export type FadeInViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** List index — staggers the entrance (capped so long lists stay snappy). */
  index?: number;
  /** Extra delay in ms before this item animates in. */
  delay?: number;
  /** Per-item stagger step in ms (default 55). */
  step?: number;
  /** Entrance duration in ms (default 360). */
  duration?: number;
};

const STAGGER_CAP = 8;

/**
 * Gentle fade-up entrance with optional index-based stagger. Wrap cards, list
 * rows, and hero sections. Honors OS reduce-motion automatically.
 */
export function FadeInView({ children, style, index = 0, delay = 0, step = 55, duration = 360 }: FadeInViewProps) {
  const total = delay + Math.min(index, STAGGER_CAP) * step;
  return (
    <Animated.View entering={FadeInDown.duration(duration).delay(total)} style={style}>
      {children}
    </Animated.View>
  );
}
