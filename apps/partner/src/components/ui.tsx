import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, STATUS_LABELS, statusColor, type BookingStatus } from '@umotor/shared';
import { PressableScale } from './motion';

type IconName = keyof typeof Ionicons.glyphMap;

// ── AstraPay / Figma palette ──────────────────────────────────────────────
// Lifted verbatim from the uMotor Figma (node 2tVEqoLxfbECiwRbVDw7bc): the
// rider app's AstraPay-blue language, now mirrored onto the workshop app so the
// two read as one product. Blue is the brand; green stays only for "lunas".
export const astra = {
  primary: '#0e4da4', // brand blue — wordmark, section titles, CTAs, active nav
  heroDark: '#1c4e93', // balance/summary hero base
  heroMid: '#2b75dc', // hero highlight band
  tile: '#d3e6ff', // light-blue action-tile / icon background
  bg: '#f3f6fb', // app background
  ink: '#0b1727', // near-black text
  sub: '#667085', // secondary text
  faint: '#98a2b3', // tertiary text / hints
  line: '#e5e9f0', // card borders / dividers
  inactive: '#b0b0b0', // inactive nav label
  onHero: '#cfe0f7', // secondary text on the blue hero
  onHeroLine: 'rgba(255,255,255,0.18)',
};

// Back-compat alias: screens import `brand.*`; keep the names, point at AstraPay blue.
export const brand = {
  deep: astra.primary,
  base: astra.primary,
  tint: astra.tile,
  tintBorder: '#bcd8ff',
  onDeep: astra.onHero,
  onDeepLine: astra.onHeroLine,
};

// ── Figma illustration assets (downloaded from the design file) ────────────
export const figAssets = {
  topLandscape: require('../../assets/figma/top-landscape.png'),
  landscapeLogin: require('../../assets/figma/landscape-login.png'),
  motorbike: require('../../assets/figma/motorbike.png'),
  motorbikeBig: require('../../assets/figma/motorbike-big.png'),
  astrapayLogo: require('../../assets/figma/astrapay-logo.png'),
  astrapayMark: require('../../assets/figma/astrapay-mark.png'),
  motopointsLogo: require('../../assets/figma/motopoints-logo.png'),
  reminderIllus: require('../../assets/figma/reminder-illus.png'),
  icGarage: require('../../assets/figma/ic-garage.png'),
  icCalendar: require('../../assets/figma/ic-calendar.png'),
  icCoins: require('../../assets/figma/ic-coins.png'),
  icSpeed: require('../../assets/figma/ic-speed.png'),
  icFlatTire: require('../../assets/figma/ic-flat-tire.png'),
  icFuel: require('../../assets/figma/ic-fuel.png'),
  icOil: require('../../assets/figma/ic-oil.png'),
  navHome: require('../../assets/figma/nav-home.png'),
  navMotorcycle: require('../../assets/figma/nav-motorcycle.png'),
  navNotification: require('../../assets/figma/nav-notification.png'),
  navProfile: require('../../assets/figma/nav-profile.png'),
} as const;

// ── Responsive system ──────────────────────────────────────────────────────
// Keyed off the SHORTEST screen side so a phone in landscape stays a phone.
// Kept in sync with the consumer app.
export const BREAKPOINTS = { tablet: 700, large: 1024 };

export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  columns: number;
  maxContentWidth: number;
  gutter: number;
  scale: (n: number) => number;
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

export function useIsWide() {
  return useResponsive().isTablet;
}

export function tabletContainer(r: Responsive): ViewStyle | null {
  return r.isTablet ? { maxWidth: r.maxContentWidth, width: '100%', alignSelf: 'center' } : null;
}

// ── Components ───────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * AstraPay balance/summary hero — the rider app's signature blue card. Solid
 * `heroDark` with a soft `heroMid` glow for the two-tone depth seen in Figma.
 * White content sits on top; use `astra.onHero` for secondary text.
 */
export function AstraHero({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.astraHero, style]}>
      <View style={styles.astraGlow} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Back-compat: `Hero` is now the AstraPay blue panel. */
export function Hero({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <AstraHero style={style}>{children}</AstraHero>;
}

/** Wide illustrated header band (Figma mountains/landscape) behind a screen top. */
export function IllustratedHeader({
  source = figAssets.topLandscape,
  height = 140,
  children,
  style,
}: {
  source?: ImageSourcePropType;
  height?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height }, style]}>
      <Image source={source} style={styles.headerImg} resizeMode="cover" />
      {children}
    </View>
  );
}

/** Light-blue rounded action tile with a Figma illustration icon (or Ionicons) + label. */
export function ActionTile({
  img,
  icon,
  label,
  onPress,
  size = 64,
}: {
  img?: ImageSourcePropType;
  icon?: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <PressableScale
      style={styles.actionTileWrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.actionTile, { width: size, height: size }]}>
        {img ? (
          <Image source={img} style={{ width: size * 0.62, height: size * 0.62 }} resizeMode="contain" />
        ) : icon ? (
          <Ionicons name={icon} size={size * 0.46} color={astra.primary} />
        ) : null}
      </View>
      <Text style={styles.actionTileLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{children}</Text>
      {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
    </>
  );
}

/** Tinted rounded icon container (Ionicons) used in KPIs and list rows. */
export function IconTile({
  icon,
  tint,
  size = 42,
  iconSize = 22,
}: {
  icon: IconName;
  tint: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      style={[
        styles.iconTile,
        { width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: tint + '1a' },
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={tint} />
    </View>
  );
}

/** Rounded filter/segment pill. Active = AstraPay blue. */
export function Pill({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.pill, style, active && styles.pillActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </PressableScale>
  );
}

/** Primary call-to-action — AstraPay blue, rounded, with a busy spinner. */
export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  icon,
  color = astra.primary,
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.primaryBtn, { backgroundColor: color }, (busy || disabled) && styles.btnBusy, style]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
          <Text style={styles.primaryBtnText}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

const COMPACT_STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  pending: 'Menunggu',
  confirmed: 'Diterima',
  checked_in: 'Check-in',
  in_progress: 'Dikerjakan',
};

export function StatusBadge({ status, compact = false }: { status: BookingStatus; compact?: boolean }) {
  const color = statusColor[status];
  const label = compact ? (COMPACT_STATUS_LABELS[status] ?? STATUS_LABELS[status]) : STATUS_LABELS[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** List/error fallback with a retry action — network drops must never dead-end. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorWrap}>
      <Ionicons name="cloud-offline-outline" size={36} color="#cbd5e1" />
      <Text style={styles.errorText}>Gagal memuat data. Periksa koneksi.</Text>
      <PressableScale style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Coba lagi</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: astra.line,
  },
  astraHero: {
    backgroundColor: astra.heroDark,
    borderRadius: 18,
    padding: 18,
    gap: 4,
    overflow: 'hidden',
  },
  astraGlow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: astra.heroMid,
    opacity: 0.55,
  },
  headerImg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  actionTileWrap: { alignItems: 'center', gap: 6 },
  actionTile: {
    borderRadius: 16,
    backgroundColor: astra.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileLabel: { fontSize: 11, fontWeight: '700', color: astra.primary, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: astra.primary },
  sectionSub: { color: astra.sub, fontSize: 12 },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: astra.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillActive: { backgroundColor: astra.primary, borderColor: astra.primary },
  pillText: { color: astra.sub, fontWeight: '700', fontSize: 13 },
  pillTextActive: { color: '#fff' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnBusy: { opacity: 0.6 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', flexShrink: 0 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  errorWrap: { alignItems: 'center', gap: 10, marginTop: 48 },
  errorText: { color: astra.faint, fontSize: 14 },
  retryBtn: {
    backgroundColor: astra.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

export { colors };
