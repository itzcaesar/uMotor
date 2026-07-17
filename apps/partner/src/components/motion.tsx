import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

// ── Shared motion primitives (Reanimated 4, UI-thread) ─────────────────────
// All animation runs on the UI thread via worklets, and only animates
// transform/opacity (compositor-friendly). Reanimated layout animations
// (`entering`) respect the OS "reduce motion" setting automatically; the
// press-scale below opts out explicitly via `useReducedMotion`.

export { FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition };
export const MotionView = Animated.View;

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

  // Keep the layout/style on the actual Pressable. The previous Animated.View
  // wrapper owned padding/background while its child button only wrapped the
  // icon and label, leaving most of buttons such as "Terima" non-clickable on
  // web. Pressable's native pressed-state style gives us the same feedback
  // without shrinking the semantic hitbox.
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        style,
        !reduced && pressed && { transform: [{ scale }] },
        dim && pressed && { opacity: 0.88 },
      ]}
    >
      {children}
    </Pressable>
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
