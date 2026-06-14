import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { colors, projectRoute, type LatLng } from '@umotor/shared';

/**
 * Renders a ride route as an SVG polyline scaled into the available width.
 * Deliberately NOT react-native-maps — a pure react-native-svg draw works in
 * Expo Go with no API key, and is deterministic for stage demos. Start marker is
 * green, the head is blue while live / red when finished.
 */
export function RouteMap({
  coords,
  height = 200,
  live = false,
  style,
}: {
  coords: LatLng[];
  height?: number;
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const proj = width > 0 && coords.length > 0 ? projectRoute(coords, width, height, 18) : null;
  const pts = proj?.points ?? [];
  const head = pts[pts.length - 1];
  const start = pts[0];

  return (
    <View style={[styles.wrap, { height }, style]} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} rx={16} fill="#eef3fb" />
          {pts.length > 1 && (
            <Polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.primary}
              strokeWidth={4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {start && <Circle cx={start.x} cy={start.y} r={6} fill={colors.accent} stroke="#fff" strokeWidth={2} />}
          {head && pts.length > 1 && (
            <Circle
              cx={head.x}
              cy={head.y}
              r={6}
              fill={live ? colors.primary : colors.danger}
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </Svg>
      )}
      {coords.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Belum ada rute</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#eef3fb',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#98a2b3', fontSize: 13 },
});
