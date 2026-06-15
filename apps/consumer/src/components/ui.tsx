import {
  Pressable,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { colors, healthColor, STATUS_LABELS, statusColor, type BookingStatus } from '@umotor/shared';
import { selectCount, useCart } from '@/lib/cart';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// ── Responsive system ────────────────────────────────────────────────────
// Single source of truth for phone/tablet layout. Keyed off the SHORTEST screen
// side so a phone in landscape stays a phone (and a tablet stays a tablet in
// either orientation). Kept in sync with the partner app's components/ui.tsx.
export const BREAKPOINTS = { tablet: 700, large: 1024 };

export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  /** Suggested grid columns for card lists: 1 phone · 2 tablet · 3 large tablet. */
  columns: number;
  /** Cap for centered content so single-column screens don't stretch edge-to-edge. */
  maxContentWidth: number;
  /** Base spacing unit (a touch larger on tablets). */
  gutter: number;
  /** Gently-clamped size multiplier — never tiny on small phones, never huge on tablets. */
  scale: (n: number) => number;
  /** Same idea, tighter clamp, for font sizes. */
  font: (n: number) => number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const shortest = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = shortest >= BREAKPOINTS.tablet;
  const isLargeTablet = shortest >= BREAKPOINTS.large;
  const ratio = clamp(Math.min(shortest, 460) / 390, 0.9, 1.18);
  const scale = (n: number) => Math.round(n * ratio);
  const font = (n: number) => Math.round(n * clamp(ratio, 0.94, 1.12));
  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isLandscape,
    columns: isLargeTablet ? 3 : isTablet ? 2 : 1,
    maxContentWidth: isLargeTablet ? 1080 : isTablet ? 760 : width,
    gutter: isTablet ? 24 : 16,
    scale,
    font,
  };
}

/** Convenience boolean for tablet-sized devices (shortest side ≥ 700pt). */
export function useIsWide() {
  return useResponsive().isTablet;
}

/**
 * Centers + caps content width on tablets. Spread into a ScrollView/FlatList
 * `contentContainerStyle` array: `[styles.content, tabletContainer(r)]`.
 */
export function tabletContainer(r: Responsive): ViewStyle | null {
  return r.isTablet ? { maxWidth: r.maxContentWidth, width: '100%', alignSelf: 'center' } : null;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Header close (X) button for modal screens that lack a native back chevron. */
export function HeaderCloseButton() {
  return (
    <Pressable
      style={styles.headerClose}
      onPress={() => safeBack()}
      hitSlop={8}
    >
      <Ionicons name="close" size={24} color={colors.primary} />
    </Pressable>
  );
}

/**
 * Header back (arrow) button for stack screens that may have no history to pop
 * (e.g. reached via replace/dismissAll). Falls back to a route when needed.
 */
export function HeaderBackButton({ fallback }: { fallback?: Href }) {
  return (
    <Pressable style={styles.headerBack} onPress={() => safeBack(fallback)} hitSlop={8}>
      <Ionicons name="arrow-back" size={24} color={colors.primary} />
    </Pressable>
  );
}

/** Header bell with live unread-notification badge. Used on the Garasi tab. */
export function NotificationsHeaderButton() {
  const userId = useSession((s) => s.userId);
  const unread = useQuery({
    queryKey: ['notif-unread', userId],
    enabled: !!userId,
    // Polling fallback in case the realtime channel drops mid-demo.
    refetchInterval: 30_000,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .eq('read', false);
      return count ?? 0;
    },
  });
  const count = unread.data ?? 0;
  return (
    <Pressable
      style={styles.cartBtn}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.primary} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Header cart icon with a live item-count badge. Used on the Marketplace tab. */
export function CartHeaderButton() {
  const count = useCart(selectCount);
  return (
    <Pressable style={styles.cartBtn} onPress={() => router.push('/cart')} hitSlop={8}>
      <Ionicons name="cart-outline" size={24} color={colors.primary} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function QtyStepper({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(qty - 1)} hitSlop={8}>
        <Ionicons name="remove" size={16} color={colors.primary} />
      </Pressable>
      <Text style={styles.stepQty}>{qty}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(qty + 1)} hitSlop={8}>
        <Ionicons name="add" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** Width of the HealthBar label column. bike/[id] aligns its meta text to this. */
export const HEALTH_LABEL_W = 92;

export function HealthBar({ label, pctUsed }: { label: string; pctUsed: number }) {
  const color = healthColor(pctUsed);
  return (
    <View style={styles.healthRow}>
      <Text style={styles.healthLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, pctUsed)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.healthPct, { color }]}>{pctUsed}%</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const color = statusColor[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  healthLabel: { width: HEALTH_LABEL_W, fontSize: 12, color: '#667085' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#eef1f6', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  healthPct: { width: 40, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cartBtn: { padding: 4, marginRight: 8 },
  headerClose: { padding: 4, marginLeft: 8 },
  headerBack: { padding: 4, marginLeft: 8 },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    backgroundColor: '#f3f6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQty: { minWidth: 18, textAlign: 'center', fontWeight: '700', color: '#0b1727' },
});

export { colors };
