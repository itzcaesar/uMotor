import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@umotor/shared';

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = polar(cx, cy, r, fromDeg);
  const end = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/** Half-circle gauge for MotoScore 300–850 (PRD 01 §4.8). */
export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const band =
    score < 580 ? { label: 'Kurang', color: colors.danger }
    : score < 670 ? { label: 'Cukup', color: colors.warning }
    : score < 740 ? { label: 'Baik', color: colors.primary }
    : { label: 'Sangat Baik', color: colors.accent };

  // Scale the whole gauge uniformly to the viewport so it never clips on a
  // 320pt phone and isn't undersized on a tablet. Base geometry is 240×130.
  const { width } = useWindowDimensions();
  const w = Math.min(Math.max(width - 64, 220), 300);
  const f = w / 240;
  const r = 100 * f;
  const cx = w / 2;
  const cy = 110 * f;
  const sw = 16 * f;

  return (
    <View style={styles.wrap}>
      <Svg width={w} height={130 * f}>
        <Path d={arcPath(cx, cy, r, 0, 180)} stroke="#eef1f6" strokeWidth={sw} fill="none" strokeLinecap="round" />
        {pct > 0.01 && (
          <Path
            d={arcPath(cx, cy, r, 0, pct * 180)}
            stroke={band.color}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={[styles.center, { top: 52 * f }]}>
        <Text style={[styles.score, { color: band.color, fontSize: 44 * f }]}>{score}</Text>
        <Text style={styles.band}>{band.label}</Text>
      </View>
      <View style={[styles.range, { width: w - 24 }]}>
        <Text style={styles.rangeText}>300</Text>
        <Text style={styles.rangeText}>850</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { position: 'absolute', top: 52, alignItems: 'center' },
  score: { fontSize: 44, fontWeight: '800' },
  band: { fontSize: 13, fontWeight: '700', color: '#667085' },
  range: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 216,
    marginTop: -14,
  },
  rangeText: { fontSize: 11, color: '#98a2b3' },
});
