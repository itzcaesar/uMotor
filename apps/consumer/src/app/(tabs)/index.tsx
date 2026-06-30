import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import type { AppNotification, ComponentHealth, Motorcycle } from '@umotor/shared';
import { BalanceCard } from '@/components/BalanceCard';
import { Illustration } from '@/components/Illustration';
import { SectionTitle, umotor, useResponsive } from '@/components/ui';
import { FadeInView, PressableScale } from '@/components/motion';
import { fetchNews, formatWhen, type NewsArticle } from '@/lib/news';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ICON = {
  sparepart: require('../../../assets/figma/ic-flat-tire.png'),
  booking: require('../../../assets/figma/ic-calendar.png'),
  bbm: require('../../../assets/figma/ic-fuel.png'),
  bengkel: require('../../../assets/figma/ic-garage.png'),
  motoscore: require('../../../assets/figma/ic-speed.png'),
  riwayat: require('../../../assets/figma/ic-time.png'),
  oil: require('../../../assets/figma/ic-oil.png'),
};

type Tile = { key: string; label: string; img?: number; iconSize?: number; glyph?: string; ion?: keyof typeof Ionicons.glyphMap; onPress: () => void };

export default function Beranda() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const contentW = Math.min(r.width, 460);
  const s = contentW / 402; // Figma frame is 402 wide
  const px = (n: number) => n * s;

  const user = useQuery({
    queryKey: ['home-user', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('name, astrapay_balance')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data as { name: string; astrapay_balance: number };
    },
  });

  const points = useQuery({
    queryKey: ['home-points', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('points').select('balance').eq('user_id', userId!).single();
      return (data?.balance ?? 0) as number;
    },
  });

  const bikeCount = useQuery({
    queryKey: ['home-bike-count', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('motorcycles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!);
      return count ?? 0;
    },
  });

  const score = useQuery({
    queryKey: ['home-score', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('motoscore').select('score').eq('user_id', userId!).single();
      return (data?.score ?? 0) as number;
    },
  });

  const spent = useQuery({
    queryKey: ['home-spent', userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('payments')
        .select('amount, created_at, user_id')
        .eq('user_id', userId!)
        .gte('created_at', start.toISOString());
      if (error) return 0; // best-effort; never block the home
      return (data ?? []).reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0);
    },
  });

  const banner = useQuery({
    queryKey: ['maintenance-banner', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AppNotification | null> => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .eq('type', 'maintenance')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  // Same source as the News page — show the latest few on the home feed.
  const news = useQuery({
    queryKey: ['news'],
    queryFn: fetchNews,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  const topNews = (news.data ?? []).slice(0, 3);
  const openArticle = (a: NewsArticle) => {
    if (!a.link) return;
    WebBrowser.openBrowserAsync(a.link, { toolbarColor: '#ffffff', controlsColor: umotor.primary }).catch(() => {});
  };

  const openBooking = async () => {
    const { data: bikes } = await supabase
      .from('motorcycles')
      .select('*')
      .eq('user_id', userId!)
      .order('created_at');
    const all = (bikes ?? []) as Motorcycle[];
    if (all.length === 0) {
      router.push('/booking/new');
      return;
    }
    const { data: health } = await supabase
      .from('component_health')
      .select('*')
      .in('motorcycle_id', all.map((b) => b.id));
    const due = (health ?? []).find((h: ComponentHealth) => h.type === 'oil' && h.pct_used >= 80);
    if (banner.data) {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', banner.data.id)
        .then(() => qc.invalidateQueries({ queryKey: ['maintenance-banner', userId] }));
    }
    router.push({
      pathname: '/booking/new',
      params: { bike: due?.motorcycle_id ?? all[0].id, service: 'oil_change' },
    });
  };

  const monthLabel = new Date().toLocaleDateString('id-ID', { month: 'long' });
  const name = user.data?.name ?? 'User';

  const tiles: Tile[] = [
    { key: 'sparepart', label: 'Sparepart', img: ICON.sparepart, iconSize: 50, onPress: () => router.push('/marketplace') },
    { key: 'tagihan', label: 'Tagihan', glyph: '$', onPress: () => router.push('/finance') },
    { key: 'booking', label: 'Booking Servis', img: ICON.booking, iconSize: 48, onPress: () => router.push('/booking/new') },
    { key: 'bbm', label: 'BBM', img: ICON.bbm, iconSize: 40, onPress: () => router.push('/bbm') },
    { key: 'bengkel', label: 'Bengkel', img: ICON.bengkel, iconSize: 34, onPress: () => router.push('/bengkel') },
    { key: 'motoscore', label: 'Moto Score', img: ICON.motoscore, iconSize: 44, onPress: () => router.push('/motoscore') },
    { key: 'community', label: 'News', ion: 'newspaper', onPress: () => router.push('/community') },
    { key: 'riwayat', label: 'Riwayat', img: ICON.riwayat, iconSize: 40, onPress: () => router.push('/bookings') },
  ];

  const refreshing = user.isRefetching || points.isRefetching || banner.isRefetching;
  const refetchAll = () => {
    user.refetch();
    points.refetch();
    spent.refetch();
    banner.refetch();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        <View style={{ width: contentW }}>
          {/* Greeting header on app bg — above the hero so nothing is covered.
              Extra top padding clears Dynamic Island on iPhone 14 Pro+ (insets.top covers it,
              plus 18px breathing room so the pill never tangles with the cutout). */}
          <View style={{ paddingHorizontal: px(19), paddingTop: insets.top + px(18), paddingBottom: px(6) }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: umotor.heroMid, paddingHorizontal: px(14), paddingVertical: px(8), borderRadius: px(999), shadowColor: '#0e4da4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 3 }}>
              <Text numberOfLines={1} style={{ fontSize: px(14), lineHeight: px(17), fontWeight: '800', color: '#fff', letterSpacing: -0.2 }}>Hi, {name} 👋</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: px(8), marginTop: px(8), flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(6), backgroundColor: '#fff', paddingHorizontal: px(12), paddingVertical: px(6), borderRadius: px(999), shadowColor: '#0e4da4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 }}>
                <Ionicons name="speedometer" size={px(12)} color={umotor.heroMid} />
                <Text style={{ fontSize: px(12), fontWeight: '700', color: umotor.heroDark }}>Moto Score {score.data ?? '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(6), backgroundColor: '#fff', paddingHorizontal: px(12), paddingVertical: px(6), borderRadius: px(999), shadowColor: '#0e4da4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 }}>
                <Ionicons name="bicycle" size={px(12)} color={umotor.heroMid} />
                <Text style={{ fontSize: px(12), fontWeight: '700', color: umotor.heroDark }}>{bikeCount.data ?? 0} Motor terdaftar</Text>
              </View>
            </View>
          </View>
          {/* ── Header: landscape + balance card ──
              Figma "illus": 548-wide scene shown in a 191-tall band (object-cover,
              centered) so clouds + mountains + bengkel all show; card overlaps the bottom. */}
          <View>
            <View style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, top: insets.top + px(8), height: px(196), overflow: 'hidden' }}>
              <View style={{ position: 'absolute', left: px(-69), top: 0 }}>
                <Illustration name="homepageLandscape" width={px(548)} />
              </View>
              <View style={{ position: 'absolute', left: px(156), top: px(150) }}>
                <Illustration name="motor" width={px(42)} />
              </View>
            </View>
            <View style={{ marginTop: insets.top + px(184), paddingHorizontal: px(19) }}>
              <FadeInView duration={420}>
                <BalanceCard
                  balance={user.data?.astrapay_balance ?? 0}
                  points={points.data ?? 0}
                  usedThisMonth={spent.data ?? 0}
                  monthLabel={monthLabel}
                  onTopUp={() => router.push('/finance')}
                  onWithdraw={() => router.push('/finance')}
                  onPoints={() => router.push('/motoscore')}
                />
              </FadeInView>
            </View>
          </View>

          {/* ── Action grid (4-col) ── */}
          <View style={[styles.grid, { paddingHorizontal: px(19), marginTop: px(24) }]}>
            {tiles.map((t, i) => (
              <FadeInView key={t.key} index={i} step={45} style={[styles.cell, { marginBottom: px(18) }]}>
                <PressableScale style={styles.tileBtn} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.label}>
                  <View style={[styles.tile, { width: px(64), height: px(64), borderRadius: px(11) }]}>
                    {t.ion ? (
                      <Ionicons name={t.ion} size={px(t.iconSize ?? 34)} color={umotor.heroDark} />
                    ) : t.glyph ? (
                      <Text style={{ fontSize: px(40), lineHeight: px(46), fontWeight: '500', color: umotor.heroDark }}>{t.glyph}</Text>
                    ) : (
                      <Image source={t.img} style={{ width: px(t.iconSize ?? 44), height: px(t.iconSize ?? 44) }} contentFit="contain" tintColor={umotor.heroDark} />
                    )}
                  </View>
                  <Text style={[styles.tileLabel, { fontSize: px(11), marginTop: px(9) }]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </PressableScale>
              </FadeInView>
            ))}
          </View>

          {/* ── Moto Reminders ── */}
          <FadeInView delay={180} style={{ paddingHorizontal: px(19), marginTop: px(8) }}>
            <SectionTitle>Moto Reminders</SectionTitle>
            <PressableScale
              style={[styles.reminder, { height: px(148), borderRadius: px(12), marginTop: px(16) }]}
              onPress={openBooking}
              accessibilityRole="button"
            >
              <View style={{ pointerEvents: 'none', position: 'absolute', left: px(-2), top: px(8) }}>
                <Illustration name="reminder" height={px(132)} />
              </View>
              <Image source={ICON.oil} style={{ position: 'absolute', right: px(15), top: px(8), width: px(16), height: px(16) }} contentFit="contain" tintColor={umotor.heroDark} />
              <View style={{ position: 'absolute', left: px(127), right: px(14), top: px(24) }}>
                <Text numberOfLines={1} style={{ fontSize: px(13), fontWeight: '500', color: umotor.heroDark }}>Halo, {name}!</Text>
                <Text numberOfLines={2} style={{ fontSize: px(16), fontWeight: '500', color: umotor.heroDark, marginTop: px(2) }}>
                  {banner.data?.title ?? 'Sudah saatnya ganti Oli nih!'}
                </Text>
              </View>
              <View style={[styles.reminderCta, { left: px(127), bottom: px(16), borderRadius: px(14), paddingHorizontal: px(14), height: px(31) }]}>
                <Text style={{ fontSize: px(11), fontWeight: '600', color: '#fff' }}>Booking Servis Sekarang!</Text>
              </View>
            </PressableScale>
          </FadeInView>

          {/* ── News (same source as the News page) ── */}
          <FadeInView delay={220} style={{ paddingHorizontal: px(19), marginTop: px(20) }}>
            <View style={styles.newsHead}>
              <SectionTitle>News</SectionTitle>
              <PressableScale onPress={() => router.push('/community')} accessibilityRole="button" accessibilityLabel="Lihat semua berita">
                <Text style={[styles.newsMore, { fontSize: px(12) }]}>Lihat semua ›</Text>
              </PressableScale>
            </View>
            <View style={{ marginTop: px(12), gap: px(10) }}>
              {news.isLoading && topNews.length === 0 ? (
                <Text style={[styles.newsEmpty, { fontSize: px(12) }]}>Memuat berita…</Text>
              ) : topNews.length === 0 ? (
                <Text style={[styles.newsEmpty, { fontSize: px(12) }]}>Berita belum tersedia.</Text>
              ) : (
                topNews.map((a) => (
                  <PressableScale
                    key={a.id}
                    style={[styles.newsCard, { borderRadius: px(14), padding: px(10) }]}
                    onPress={() => openArticle(a)}
                    accessibilityRole="button"
                    accessibilityLabel={a.title}
                  >
                    {a.image ? (
                      <Image source={{ uri: a.image }} style={{ width: px(64), height: px(64), borderRadius: px(10) }} contentFit="cover" transition={200} />
                    ) : (
                      <View style={[styles.newsThumbFallback, { width: px(64), height: px(64), borderRadius: px(10) }]}>
                        <Ionicons name="newspaper" size={px(24)} color={umotor.heroMid} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: px(11), justifyContent: 'center' }}>
                      <Text numberOfLines={2} style={[styles.newsTitle, { fontSize: px(13) }]}>{a.title}</Text>
                      <Text numberOfLines={1} style={[styles.newsMeta, { fontSize: px(10.5), marginTop: px(4) }]}>
                        {a.source}{a.publishedAt ? ` · ${formatWhen(a.publishedAt, Date.now())}` : ''}
                      </Text>
                    </View>
                  </PressableScale>
                ))
              )}
            </View>
          </FadeInView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '25%', alignItems: 'center' },
  tileBtn: { alignItems: 'center' },
  tile: { backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: umotor.heroDark, fontWeight: '500', textAlign: 'center' },
  reminder: { backgroundColor: '#fff', overflow: 'hidden' },
  reminderCta: { position: 'absolute', backgroundColor: umotor.primary, alignItems: 'center', justifyContent: 'center' },
  newsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newsMore: { color: umotor.primary, fontWeight: '700' },
  newsEmpty: { color: umotor.faint, textAlign: 'center', paddingVertical: 12 },
  newsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  newsThumbFallback: { backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  newsTitle: { color: umotor.heroDark, fontWeight: '700' },
  newsMeta: { color: umotor.faint, fontWeight: '500' },
});
