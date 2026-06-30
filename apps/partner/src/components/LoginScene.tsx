import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { astra } from './ui';

const ROAD = '#163a6b';

/**
 * Custom flat-vector login backdrop — a motor workshop (bengkel) beside a street,
 * with mountains, hills, layered trees, clouds, a street lamp and a scooter.
 * Drawn in the AstraPay-blue palette to match the Figma illustration style.
 * The bottom edge is the road (color ROAD), so a plain ROAD-coloured ground panel
 * behind it reads as one continuous surface.
 */
export function LoginScene({ width }: { width: number }) {
  const height = width * (280 / 412);
  return (
    <Svg width={width} height={height} viewBox="0 0 412 280">
      {/* hills */}
      <Path d="M-12 198 Q92 150 232 206 L232 238 L-12 238 Z" fill={astra.tile} />
      <Path d="M236 208 Q330 162 424 200 L424 238 L236 238 Z" fill={astra.heroMid} />

      {/* blue clouds */}
      <Cloud cx={70} cy={42} s={1.05} />
      <Cloud cx={252} cy={30} s={0.95} color="#bcd8ff" />
      <Cloud cx={360} cy={72} s={0.8} />
      <Cloud cx={150} cy={96} s={0.7} color="#bcd8ff" />
      <Cloud cx={306} cy={122} s={0.6} />

      {/* trees (left) */}
      <Tree cx={48} baseY={238} scale={1.05} />
      <Tree cx={86} baseY={238} scale={0.72} />

      {/* workshop building */}
      <Polygon points="84,132 244,132 224,100 104,100" fill={astra.heroDark} />
      <Rect x={94} y={132} width={150} height={106} fill="#eef4fd" />
      {/* garage bay (rolling door) */}
      <Rect x={108} y={166} width={62} height={72} rx={3} fill="#0e2a52" />
      <Line x1={108} y1={184} x2={170} y2={184} stroke={astra.heroDark} strokeWidth={2} />
      <Line x1={108} y1={200} x2={170} y2={200} stroke={astra.heroDark} strokeWidth={2} />
      <Line x1={108} y1={216} x2={170} y2={216} stroke={astra.heroDark} strokeWidth={2} />
      {/* side door */}
      <Rect x={192} y={188} width={34} height={50} rx={2} fill={astra.heroMid} />
      <Circle cx={198} cy={214} r={2} fill="#ffffff" />
      {/* wrench emblem */}
      <Circle cx={209} cy={150} r={11} fill={astra.tile} />
      <Path d="M213 143 a4.5 4.5 0 1 0 -1 5.6 l4.5 4.5 2.2 -2.2 -4.5 -4.5 a4.5 4.5 0 0 0 -1.2 -3.4 z" fill={astra.primary} />

      {/* street lamp */}
      <Rect x={306} y={150} width={6} height={88} rx={2} fill={astra.heroDark} />
      <Rect x={306} y={150} width={22} height={6} rx={3} fill={astra.heroDark} />
      <Circle cx={328} cy={156} r={7} fill="#ffd76b" />
      <Circle cx={328} cy={156} r={12} fill="#ffd76b" opacity={0.25} />

      {/* road */}
      <Rect x={0} y={238} width={412} height={42} fill={ROAD} />
      <Rect x={0} y={238} width={412} height={4} fill={astra.heroMid} />
      {[16, 78, 140, 202, 264, 326, 388].map((x) => (
        <Rect key={x} x={x} y={257} width={28} height={5} rx={2.5} fill={astra.tile} opacity={0.7} />
      ))}

      {/* scooter (parked on the road) */}
      <G>
        <Circle cx={250} cy={232} r={13} fill="#0e2a52" />
        <Circle cx={250} cy={232} r={5} fill={astra.heroMid} />
        <Circle cx={306} cy={232} r={13} fill="#0e2a52" />
        <Circle cx={306} cy={232} r={5} fill={astra.heroMid} />
        <Path d="M250 232 L300 232 Q310 232 309 222 L262 222 Q254 222 250 232 Z" fill={astra.primary} />
        <Path d="M262 222 Q268 210 284 214 L286 222 Z" fill={astra.heroDark} />
        <Rect x={296} y={202} width={5} height={22} rx={2} fill={astra.heroDark} />
        <Rect x={298} y={200} width={18} height={5} rx={2} fill={astra.heroDark} />
      </G>
    </Svg>
  );
}

/** A soft three-lobe cloud. */
function Cloud({
  cx,
  cy,
  s,
  color = astra.tile,
}: {
  cx: number;
  cy: number;
  s: number;
  color?: string;
}) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={30 * s} ry={14 * s} fill={color} />
      <Ellipse cx={cx - 24 * s} cy={cy + 4 * s} rx={18 * s} ry={11 * s} fill={color} />
      <Ellipse cx={cx + 26 * s} cy={cy + 4 * s} rx={20 * s} ry={12 * s} fill={color} />
    </G>
  );
}

/** A bushy layered tree (overlapping circles + trunk). */
function Tree({ cx, baseY, scale }: { cx: number; baseY: number; scale: number }) {
  const s = scale;
  return (
    <G>
      <Rect x={cx - 4 * s} y={baseY - 52 * s} width={8 * s} height={52 * s} rx={3} fill={astra.heroDark} />
      <Circle cx={cx} cy={baseY - 62 * s} r={22 * s} fill={astra.heroMid} />
      <Circle cx={cx - 16 * s} cy={baseY - 50 * s} r={15 * s} fill={astra.primary} />
      <Circle cx={cx + 16 * s} cy={baseY - 50 * s} r={15 * s} fill={astra.primary} />
      <Circle cx={cx} cy={baseY - 48 * s} r={16 * s} fill={astra.heroMid} />
      <Circle cx={cx - 7 * s} cy={baseY - 70 * s} r={8 * s} fill="#5b93e0" />
    </G>
  );
}
