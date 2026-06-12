import { Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, healthColor, STATUS_LABELS, statusColor, type BookingStatus } from '@umotor/shared';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
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
});

export { colors };
