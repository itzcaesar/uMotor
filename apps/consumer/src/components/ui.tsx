import { Pressable, Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, healthColor, STATUS_LABELS, statusColor, type BookingStatus } from '@umotor/shared';
import { selectCount, useCart } from '@/lib/cart';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
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
      <Pressable style={styles.stepBtn} onPress={() => onChange(qty - 1)} hitSlop={6}>
        <Ionicons name="remove" size={16} color={colors.primary} />
      </Pressable>
      <Text style={styles.stepQty}>{qty}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(qty + 1)} hitSlop={6}>
        <Ionicons name="add" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export function HealthBar({ label, pctUsed }: { label: string; pctUsed: number }) {
  const color = healthColor(pctUsed);
  return (
    <View style={styles.healthRow}>
      <Text style={styles.healthLabel}>{label}</Text>
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
  healthLabel: { width: 92, fontSize: 12, color: '#667085' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#eef1f6', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  healthPct: { width: 40, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cartBtn: { padding: 4, marginRight: 8 },
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
    width: 28,
    height: 28,
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
