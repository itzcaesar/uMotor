import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, STATUS_LABELS, statusColor, type BookingStatus } from '@umotor/shared';

// ── Responsive system ────────────────────────────────────────────────────
// Single source of truth for phone/tablet layout. Keyed off the SHORTEST screen
// side so a phone in landscape stays a phone (the old width>=768 check treated
// a landscape phone as a tablet). Kept in sync with the consumer app.
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

export function StatusBadge({ status }: { status: BookingStatus }) {
  const color = statusColor[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

/** List/error fallback with a retry action — network drops must never dead-end. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorWrap}>
      <Ionicons name="cloud-offline-outline" size={36} color="#cbd5e1" />
      <Text style={styles.errorText}>Gagal memuat data. Periksa koneksi.</Text>
      <Pressable style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Coba lagi</Text>
      </Pressable>
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
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  errorWrap: { alignItems: 'center', gap: 10, marginTop: 48 },
  errorText: { color: '#98a2b3', fontSize: 14 },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export { colors };
