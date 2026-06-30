import {
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
import { PressableScale } from '@/components/motion';
import { safeBack } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type IconName = keyof typeof Ionicons.glyphMap;

// ── uMotor / AstraPay palette ──────────────────────────────────────────────
// Lifted verbatim from the uMotor Figma (file 2tVEqoLxfbECiwRbVDw7bc). The blue
// is the brand: wordmark, section titles, CTAs, active nav. Kept local to the
// consumer app — the shared `colors` (green) stays untouched for other apps.
export const umotor = {
  primary: '#0e4da4', // deep brand blue — titles, CTAs, FAB, active nav, icons
  bright: '#1781ff', // bright accent blue (illustrations / highlights)
  heroDark: '#1c4e93', // hero/summary base + Moto Points panel + mountains
  heroMid: '#2b75dc', // balance-card highlight band
  tile: '#d3e6ff', // light-blue action-tile / icon background
  tileBorder: '#c4dcfb',
  bg: '#f3f6fb', // app background
  ink: '#0b1727', // near-black text
  sub: '#667085', // secondary text
  faint: '#98a2b3', // tertiary text / hints
  line: '#e5e9f0', // card borders / dividers
  inactive: '#b0b0b0', // inactive nav label
  onHero: '#cfe0f7', // secondary text on the blue hero
  onHeroLine: 'rgba(255,255,255,0.18)',
};

/**
 * Moto Health *score* colour (0–100, higher = healthier). Distinct from the
 * shared `healthColor(pctUsed)` which is keyed on wear %. Matches the Figma
 * "Moto Health Color Parameter": green → lime → amber → red.
 */
export function healthScoreColor(score: number): string {
  if (score >= 80) return '#4ecb9b'; // green (Figma)
  if (score >= 60) return '#c0cb4e'; // lime (Figma)
  return '#cb5a4e'; // red (Figma)
}

/** Per-bike Moto Health score (0–100). Heuristic tuned to the demo (oil 80% → 76). */
export function motoHealthScore(pctUsedList: number[]): number {
  if (pctUsedList.length === 0) return 100;
  const worst = Math.max(...pctUsedList, 0);
  return Math.max(0, Math.min(100, Math.round(100 - 0.3 * worst)));
}

/** Navy section heading with a trailing hairline rule (Figma: "Moto Reminders"). */
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionTitleRow, style]}>
      <Text style={styles.sectionTitleText}>{children}</Text>
      <View style={styles.sectionTitleRule} />
    </View>
  );
}

/** Light-blue rounded action tile: blue icon in a circle/square + label below. */
export function ActionTile({
  icon,
  label,
  onPress,
  width,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  width?: number | string;
}) {
  return (
    <PressableScale
      style={[styles.actionTile, width != null && ({ width } as ViewStyle)]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={26} color={umotor.primary} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Primary blue pill button (Figma CTA). */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
  small,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.primaryBtn, small && styles.primaryBtnSmall, disabled && styles.primaryBtnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.primaryBtnText, small && styles.primaryBtnTextSmall]}>{label}</Text>
    </PressableScale>
  );
}

/** Filter chip — blue when active, light outline when not. */
export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <PressableScale
      style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextIdle]}>{label}</Text>
    </PressableScale>
  );
}

/** Square Moto-Health badge: stacked "Moto Health" label + big score number. */
export function HealthScoreBadge({ score, size = 64 }: { score: number; size?: number }) {
  const bg = healthScoreColor(score);
  return (
    <View style={[styles.scoreBadge, { width: size, height: size, backgroundColor: bg }]}>
      <Text style={styles.scoreBadgeLabel}>Moto Health</Text>
      <Text style={styles.scoreBadgeNum}>{score}</Text>
    </View>
  );
}

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
    <PressableScale
      style={styles.headerClose}
      onPress={() => safeBack()}
      hitSlop={8}
    >
      <Ionicons name="close" size={24} color={umotor.primary} />
    </PressableScale>
  );
}

/**
 * Header back (arrow) button for stack screens that may have no history to pop
 * (e.g. reached via replace/dismissAll). Falls back to a route when needed.
 */
export function HeaderBackButton({ fallback }: { fallback?: Href }) {
  return (
    <PressableScale style={styles.headerBack} onPress={() => safeBack(fallback)} hitSlop={8}>
      <Ionicons name="arrow-back" size={24} color={umotor.primary} />
    </PressableScale>
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
    <PressableScale
      style={styles.cartBtn}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'}
    >
      <Ionicons name="notifications-outline" size={24} color={umotor.primary} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/** Header cart icon with a live item-count badge. Used on the Marketplace tab. */
export function CartHeaderButton() {
  const count = useCart(selectCount);
  return (
    <PressableScale style={styles.cartBtn} onPress={() => router.push('/cart')} hitSlop={8}>
      <Ionicons name="cart-outline" size={24} color={umotor.primary} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count}</Text>
        </View>
      )}
    </PressableScale>
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
      <PressableScale style={styles.stepBtn} onPress={() => onChange(qty - 1)} hitSlop={8}>
        <Ionicons name="remove" size={16} color={umotor.primary} />
      </PressableScale>
      <Text style={styles.stepQty}>{qty}</Text>
      <PressableScale style={styles.stepBtn} onPress={() => onChange(qty + 1)} hitSlop={8}>
        <Ionicons name="add" size={16} color={umotor.primary} />
      </PressableScale>
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

  // Section heading + hairline rule
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  sectionTitleText: { color: umotor.primary, fontSize: 18, fontWeight: '800' },
  sectionTitleRule: { flex: 1, height: 1, backgroundColor: umotor.tileBorder },

  // Action tile
  actionTile: { alignItems: 'center', gap: 8 },
  actionIconWrap: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 84,
    borderRadius: 18,
    backgroundColor: umotor.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: umotor.ink, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Primary button
  primaryBtn: {
    backgroundColor: umotor.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnSmall: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  primaryBtnTextSmall: { fontSize: 13 },

  // Pill / chip
  pill: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pillActive: { backgroundColor: umotor.primary },
  pillIdle: { backgroundColor: '#fff', borderWidth: 1, borderColor: umotor.line },
  pillText: { fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  pillTextIdle: { color: umotor.sub },

  // Moto-Health score badge
  scoreBadge: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  scoreBadgeLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 9, fontWeight: '700' },
  scoreBadgeNum: { color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 30 },
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
    backgroundColor: '#e0543f',
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
