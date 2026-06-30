import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ILLUSTRATIONS, type IllustrationName } from '@/lib/illustrations';

/**
 * Renders one of the uMotor Figma illustrations (provided SVG assets, with their
 * <style> class fills inlined for react-native-svg). Pass either `width` or
 * `height` — the other is derived from the SVG's viewBox aspect ratio so the
 * artwork never distorts.
 */
export function Illustration({
  name,
  width,
  height,
  style,
  opacity,
}: {
  name: IllustrationName;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  opacity?: number;
}) {
  const xml = ILLUSTRATIONS[name];
  const ratio = useMemo(() => {
    const m = xml.match(/viewBox="([\d.\-\s]+)"/);
    if (!m) return 1;
    const p = m[1].trim().split(/\s+/).map(Number);
    return p[2] && p[3] ? p[2] / p[3] : 1;
  }, [xml]);

  let w = width;
  let h = height;
  if (w != null && h == null) h = w / ratio;
  else if (h != null && w == null) w = h * ratio;

  return <SvgXml xml={xml} width={w} height={h} opacity={opacity} style={style} />;
}

export type { IllustrationName };
