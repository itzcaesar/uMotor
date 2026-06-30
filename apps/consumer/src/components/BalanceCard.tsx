import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { umotor } from './ui';

const astrapayMark = require('../../assets/figma/astrapay-mark.png');
const plusIcon = require('../../assets/figma/ic-plus.png');
const withdrawIcon = require('../../assets/figma/ic-withdraw.png');

/**
 * Figma balance card: a bright AstraPay-wallet card (rounded on all corners)
 * stacked ON TOP of the navy Moto Points card, so its right rounded corners
 * float over the navy. Fixed readable sizes — react-native-web's
 * adjustsFontSizeToFit truncates rather than shrinks, so it's avoided.
 */
export function BalanceCard({
  balance,
  points,
  usedThisMonth,
  monthLabel,
  onTopUp,
  onWithdraw,
  onPoints,
}: {
  balance: number;
  points: number;
  usedThisMonth?: number;
  monthLabel?: string;
  onTopUp?: () => void;
  onWithdraw?: () => void;
  onPoints?: () => void;
}) {
  const fmt = (n: number) => n.toLocaleString('id-ID');

  return (
    <View style={styles.card}>
      {/* ── Moto Points (navy base, content on the right) ── */}
      <Pressable style={styles.points} onPress={onPoints}>
        <View style={styles.pointsTop}>
          <Text style={styles.pointsLabel}>Moto Points</Text>
          <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.55)" />
        </View>
        <Text style={styles.pointsValue} numberOfLines={1}>{fmt(points)}</Text>
        <View style={styles.pointsHintRow}>
          <Ionicons name="information-circle-outline" size={10} color="rgba(255,255,255,0.8)" />
          <Text style={styles.pointsHint} numberOfLines={1}>Cara dapat Moto Points</Text>
        </View>
      </Pressable>

      {/* ── AstraPay wallet (blue card, floats on top-left) ── */}
      <View style={styles.wallet}>
        <View style={styles.walletText}>
          <View style={styles.labelRow}>
            <Image source={astrapayMark} style={styles.mark} contentFit="contain" tintColor="#fff" />
            <Text style={styles.label}>Saldo AstraPay</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.rp}>Rp</Text>
            <Text style={styles.amount} numberOfLines={1}>{fmt(balance)}</Text>
          </View>
          <Pressable style={styles.usedRow} onPress={onTopUp} hitSlop={6}>
            <Ionicons name="stats-chart" size={10} color="#fff" />
            <Text style={styles.used} numberOfLines={1}>
              <Text>Rp. {fmt(usedThisMonth ?? 0)}</Text>
              {` terpakai${monthLabel ? ` di bulan ${monthLabel}` : ''}`}
            </Text>
            <Ionicons name="chevron-forward" size={10} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.miniBtn} onPress={onTopUp} accessibilityRole="button" accessibilityLabel="Top up">
            <Image source={plusIcon} style={styles.miniIcon} contentFit="contain" tintColor="#fff" />
            <Text style={styles.miniLabel}>Top up</Text>
          </Pressable>
          <Pressable style={styles.miniBtn} onPress={onWithdraw} accessibilityRole="button" accessibilityLabel="Tarik Tunai">
            <Image source={withdrawIcon} style={styles.miniIcon} contentFit="contain" tintColor="#fff" />
            <Text style={styles.miniLabel}>Tarik Tunai</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // navy base
  card: { height: 118, borderRadius: 18, backgroundColor: umotor.heroDark, position: 'relative' },

  // Moto Points — right ~38%
  points: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%', paddingHorizontal: 13, paddingVertical: 13, justifyContent: 'center' },
  pointsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pointsLabel: { color: '#fff', fontSize: 12.5, fontWeight: '400' },
  pointsValue: { color: '#fff', fontSize: 28, lineHeight: 33, fontWeight: '800', marginTop: 4 },
  pointsHintRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  pointsHint: { color: 'rgba(255,255,255,0.85)', fontSize: 8.5, flexShrink: 1 },

  // AstraPay wallet — blue card on top-left, ~70%, all corners rounded
  wallet: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    backgroundColor: umotor.heroMid,
    borderRadius: 18,
    flexDirection: 'row',
    padding: 14,
    boxShadow: '2px 2px 8px rgba(11,23,39,0.18)',
    elevation: 5,
  },
  walletText: { flex: 1, justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: { width: 16, height: 15 },
  label: { color: '#fff', fontSize: 12.5, fontWeight: '400' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 7 },
  rp: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 3, marginRight: 3 },
  amount: { color: '#fff', fontSize: 25, lineHeight: 29, fontWeight: '800' },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 },
  used: { color: '#fff', fontSize: 9.5, flexShrink: 1 },

  actions: { justifyContent: 'center', gap: 7, marginLeft: 6 },
  miniBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', gap: 1 },
  miniIcon: { width: 12, height: 12 },
  miniLabel: { color: '#fff', fontSize: 6.5, fontWeight: '600' },
});
