import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  COMPONENT_LABELS,
  type ComponentHealth,
  type ComponentType,
  type Motorcycle,
} from '@umotor/shared';
import { healthScoreColor, motoHealthScore, umotor, useResponsive } from '@/components/ui';
import { FadeInUp, FadeInView, MotionView, PressableScale } from '@/components/motion';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const COMP_ICON: Record<ComponentType, number> = {
  oil: require('../../../assets/figma/ic-engine-oil.png'),
  tire: require('../../../assets/figma/ic-tire.png'),
  battery: require('../../../assets/figma/ic-battery.png'),
  brake_pad: require('../../../assets/figma/ic-brake.png'),
  air_filter: require('../../../assets/figma/ic-air.png'),
};
const COMP_ORDER: ComponentType[] = ['oil', 'tire', 'battery', 'brake_pad', 'air_filter'];
const checkIcon = require('../../../assets/figma/ic-check.png');

interface BikeWithHealth extends Motorcycle {
  health: ComponentHealth[];
}

// ── Pie-fill circular gauge (navy wedge = pct used, on a light disc) ──
function wedgePath(r: number, pct: number): string {
  const a = (Math.min(pct, 99.999) / 100) * 2 * Math.PI;
  const ex = r + r * Math.sin(a);
  const ey = r - r * Math.cos(a);
  return `M${r},${r} L${r},0 A${r},${r} 0 ${pct > 50 ? 1 : 0} 1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
}

function CircularGauge({ pct, size, icon, iconSize }: { pct: number; size: number; icon: number; iconSize: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r} fill="#94b0d6" />
        {pct >= 100 ? (
          <Circle cx={r} cy={r} r={r} fill={umotor.heroDark} />
        ) : pct > 0 ? (
          <Path d={wedgePath(r, pct)} fill={umotor.heroDark} />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={icon} style={{ width: iconSize, height: iconSize, marginBottom: size * 0.04 }} contentFit="contain" tintColor={'#fff'} />
          <Text style={{ color: '#fff', fontSize: size * 0.22, fontWeight: '700' }}>{pct}%</Text>
        </View>
      </View>
    </View>
  );
}

function ChevronDown({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 16 10">
      <Path d="M2 2 L8 8 L14 2" stroke={umotor.heroDark} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function Garasi() {
  const userId = useSession((s) => s.userId);
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<string | null>(null);

  const contentW = Math.min(r.width, 460);
  const s = contentW / 402;
  const px = (n: number) => n * s;

  const bikes = useQuery({
    queryKey: ['garage', userId],
    enabled: !!userId,
    queryFn: async (): Promise<BikeWithHealth[]> => {
      const { data: rows, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at');
      if (error) throw error;
      const ids = (rows ?? []).map((m) => m.id);
      const { data: health } = await supabase.from('component_health').select('*').in('motorcycle_id', ids);
      return (rows ?? []).map((m) => ({ ...m, health: (health ?? []).filter((h) => h.motorcycle_id === m.id) }));
    },
  });

  const data = bikes.data ?? [];
  const openId = expanded === null ? data[0]?.id ?? null : expanded || null;
  const cardW = contentW - px(42);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + px(20), paddingBottom: insets.bottom + 100, paddingHorizontal: px(21) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bikes.isRefetching} onRefresh={() => bikes.refetch()} />}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { fontSize: px(18) }]}>Garasi mu</Text>
          <View style={styles.rule} />
        </View>

        {data.map((bike, i) => {
          const score = motoHealthScore(bike.health.map((h) => h.pct_used));
          const isOpen = openId === bike.id;
          const worst = [...bike.health].sort((a, b) => b.pct_used - a.pct_used)[0];
          const odo = (bike.odometer_km ?? 0).toLocaleString('id-ID');
          const byType = (t: ComponentType) => bike.health.find((h) => h.type === t)?.pct_used ?? 0;

          return (
            <FadeInView key={bike.id} index={i} style={{ marginTop: px(15) }}>
              <PressableScale
                style={[styles.card, { width: cardW, height: px(58), borderRadius: px(11) }]}
                onPress={() => setExpanded(isOpen ? '' : bike.id)}
                accessibilityRole="button"
              >
                <View style={[styles.badge, { width: px(61), height: px(58), borderRadius: px(11), backgroundColor: healthScoreColor(score) }]}>
                  <Text style={[styles.badgeLabel, { fontSize: px(7) }]}>Moto Health</Text>
                  <Text style={[styles.badgeNum, { fontSize: px(28), lineHeight: px(32) }]}>{score}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: px(18), justifyContent: 'center' }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.bikeName, { fontSize: px(16) }]} numberOfLines={1}>
                      {bike.brand} {bike.model}
                    </Text>
                    <Image source={checkIcon} style={{ width: px(13), height: px(13), marginLeft: px(6) }} contentFit="contain" />
                  </View>
                  <View style={{ flexDirection: 'row', marginTop: px(8) }}>
                    <Text style={[styles.meta, { fontSize: px(12), width: px(80) }]}>{bike.plate}</Text>
                    <Text style={[styles.meta, { fontSize: px(12) }]}>{odo}km</Text>
                  </View>
                </View>
                <View style={{ width: px(20), marginRight: px(14), alignItems: 'center', transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                  <ChevronDown size={px(16)} />
                </View>
              </PressableScale>

              {isOpen && (
                <MotionView entering={FadeInUp.duration(220)} style={[styles.panelBack, { width: cardW, borderRadius: px(11), marginTop: px(7), paddingBottom: px(6) }]}>
                  <View style={[styles.panelFront, { borderRadius: px(11), paddingHorizontal: px(15), paddingTop: px(9), paddingBottom: px(12) }]}>
                    {worst && worst.pct_used >= 80 && (
                      <View style={[styles.reminder, { height: px(22), borderRadius: px(11) }]}>
                        <View style={[styles.reminderFill, { width: `${Math.min(96, worst.pct_used)}%`, borderRadius: px(11) }]} />
                        <Image source={COMP_ICON[worst.type]} style={{ width: px(13), height: px(13), marginLeft: px(8), zIndex: 1 }} contentFit="contain" tintColor={'#fff'} />
                        <Text style={[styles.reminderText, { fontSize: px(8.5), marginLeft: px(6) }]} numberOfLines={1}>
                          Segera Ganti {COMPONENT_LABELS[worst.type]}-mu!
                        </Text>
                        <Text style={[styles.reminderPct, { fontSize: px(10) }]}>{worst.pct_used}%</Text>
                      </View>
                    )}

                    <View style={[styles.gauges, { marginTop: px(14) }]}>
                      {COMP_ORDER.map((t) => (
                        <View key={t} style={{ alignItems: 'center', width: px(57) }}>
                          <CircularGauge pct={byType(t)} size={px(53)} icon={COMP_ICON[t]} iconSize={px(t === 'oil' ? 20 : 15)} />
                          <Text style={[styles.gaugeLabel, { fontSize: px(10), marginTop: px(6) }]} numberOfLines={1}>
                            {COMPONENT_LABELS[t]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <PressableScale onPress={() => router.push({ pathname: '/bike/[id]', params: { id: bike.id } })} style={styles.detailLink}>
                    <Text style={[styles.detailText, { fontSize: px(13) }]}>Lihat Detail Motor</Text>
                  </PressableScale>
                </MotionView>
              )}
            </FadeInView>
          );
        })}

        {data.length === 0 && (
          <Text style={styles.empty}>{bikes.isLoading ? 'Memuat garasi…' : 'Belum ada motor.'}</Text>
        )}

        <View style={{ alignItems: 'center', marginTop: px(30) }}>
          <PressableScale
            style={[styles.fab, { width: px(56), height: px(56), borderRadius: px(17) }]}
            onPress={() => router.push('/add-bike')}
            accessibilityRole="button"
            accessibilityLabel="Tambah motor"
          >
            <Text style={{ color: '#fff', fontSize: px(36), lineHeight: px(42), fontWeight: '400' }}>+</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { color: umotor.heroDark, fontWeight: '800' },
  rule: { flex: 1, height: 1, backgroundColor: '#c4dcfb' },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#d1e4ff', overflow: 'hidden' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { color: 'rgba(255,255,255,0.95)', fontWeight: '600' },
  badgeNum: { color: '#fff', fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  bikeName: { color: '#000', fontWeight: '500', flexShrink: 1 },
  meta: { color: 'rgba(0,0,0,0.42)', fontWeight: '500' },

  panelBack: { backgroundColor: '#91bfff' },
  panelFront: { backgroundColor: '#d1e4ff' },
  reminder: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#a8c7f1', overflow: 'hidden' },
  reminderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: umotor.heroDark },
  reminderText: { color: '#fff', flex: 1 },
  reminderPct: { color: '#36507e', fontWeight: '700', marginRight: 10 },
  gauges: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabel: { color: umotor.heroDark, fontWeight: '500', textAlign: 'center' },
  detailLink: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  detailText: { color: 'rgba(0,0,0,0.6)', fontWeight: '700' },

  empty: { textAlign: 'center', color: umotor.faint, marginTop: 48 },
  fab: { backgroundColor: umotor.heroDark, alignItems: 'center', justifyContent: 'center' },
});
