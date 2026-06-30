import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { tabletContainer, umotor, useResponsive } from '@/components/ui';
import { safeBack } from '@/lib/nav';
import { fetchNews, formatWhen, type NewsArticle, type NewsCategory } from '@/lib/news';

const backIcon = require('../../../assets/figma/ic-back.png');

const FILTERS: ('Semua' | NewsCategory)[] = ['Semua', 'Otomotif', 'Astra'];
const catColor = (c: NewsCategory) => (c === 'Astra' ? umotor.primary : umotor.heroMid);
const catIcon = (c: NewsCategory): keyof typeof Ionicons.glyphMap => (c === 'Astra' ? 'card' : 'speedometer');

export default function News() {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const [filter, setFilter] = useState<'Semua' | NewsCategory>('Semua');

  const news = useQuery({
    queryKey: ['news'],
    queryFn: fetchNews,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const now = Date.now();
  const list = useMemo(() => {
    const all = news.data ?? [];
    return filter === 'Semua' ? all : all.filter((a) => a.category === filter);
  }, [news.data, filter]);
  const featured = list[0];
  const rest = list.slice(1);

  const open = (a: NewsArticle) => {
    if (!a.link) return;
    // In-app browser (Custom Tab / SFSafariVC) — the rider stays inside uMotor.
    WebBrowser.openBrowserAsync(a.link, { toolbarColor: '#ffffff', controlsColor: umotor.primary }).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={() => safeBack('/(tabs)')} hitSlop={10} style={{ width: 25, height: 25 }} accessibilityLabel="Kembali">
          <Image source={backIcon} style={{ width: 25, height: 25 }} contentFit="contain" tintColor={umotor.heroDark} />
        </Pressable>
        <Text style={styles.headerTitle}>News</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, tabletContainer(r), { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={news.isRefetching} onRefresh={() => news.refetch()} />}
      >
        <Text style={styles.lead}>Berita otomotif & Astra terbaru</Text>

        {/* category chips */}
        <View style={styles.chips}>
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
                <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>{f}</Text>
              </Pressable>
            );
          })}
        </View>

        {news.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={umotor.primary} />
            <Text style={styles.centerText}>Memuat berita…</Text>
          </View>
        ) : news.isError ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={36} color={umotor.faint} />
            <Text style={styles.centerText}>Gagal memuat berita.</Text>
            <Pressable style={styles.retryBtn} onPress={() => news.refetch()}>
              <Text style={styles.retryText}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* featured */}
            {featured && (
              <Pressable onPress={() => open(featured)}>
                <View style={styles.featured}>
                  {featured.image ? (
                    <Image source={{ uri: featured.image }} style={styles.featuredImg} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.featuredImg, { backgroundColor: catColor(featured.category), alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={catIcon(featured.category)} size={52} color="rgba(255,255,255,0.9)" />
                    </View>
                  )}
                  <View style={[styles.catPill, { backgroundColor: catColor(featured.category) }]}>
                    <Text style={styles.catPillText}>{featured.category}</Text>
                  </View>
                  <View style={styles.featuredBody}>
                    <Text style={styles.featuredTitle} numberOfLines={3}>{featured.title}</Text>
                    {!!featured.snippet && <Text style={styles.featuredSnippet} numberOfLines={2}>{featured.snippet}</Text>}
                    <Text style={styles.meta}>{featured.source}{featured.publishedAt ? ` · ${formatWhen(featured.publishedAt, now)}` : ''}</Text>
                  </View>
                </View>
              </Pressable>
            )}

            {/* list */}
            {rest.map((a) => (
              <Pressable key={a.id} onPress={() => open(a)}>
                <View style={styles.card}>
                  {a.image ? (
                    <Image source={{ uri: a.image }} style={styles.thumb} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: catColor(a.category) + '1f', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={catIcon(a.category)} size={24} color={catColor(a.category)} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={[styles.tag, { backgroundColor: catColor(a.category) + '22', alignSelf: 'flex-start' }]}>
                      <Text style={[styles.tagText, { color: catColor(a.category) }]}>{a.category}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={3}>{a.title}</Text>
                    <Text style={styles.meta}>{a.source}{a.publishedAt ? ` · ${formatWhen(a.publishedAt, now)}` : ''}</Text>
                  </View>
                </View>
              </Pressable>
            ))}

            {list.length === 0 && <Text style={styles.empty}>Belum ada berita untuk kategori ini.</Text>}
            <Text style={styles.footnote}>Berita dari Google News · ketuk untuk baca di dalam aplikasi</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: umotor.heroDark },
  content: { paddingHorizontal: 16, paddingTop: 2, gap: 12 },
  lead: { color: umotor.sub, fontSize: 13 },

  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { height: 30, borderRadius: 30, paddingHorizontal: 16, justifyContent: 'center' },
  chipActive: { backgroundColor: umotor.heroDark },
  chipIdle: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e2f0' },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipTextIdle: { color: 'rgba(28,78,147,0.67)' },

  featured: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  featuredImg: { width: '100%', height: 168 },
  catPill: { position: 'absolute', top: 12, left: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  catPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  featuredBody: { padding: 16, gap: 5 },
  featuredTitle: { color: umotor.ink, fontSize: 17, fontWeight: '800', lineHeight: 22 },
  featuredSnippet: { color: '#475467', fontSize: 13, lineHeight: 19 },

  card: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  thumb: { width: 76, height: 76, borderRadius: 12 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 10, fontWeight: '700' },
  cardTitle: { color: umotor.ink, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  meta: { color: umotor.faint, fontSize: 11, marginTop: 1 },

  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 },
  centerText: { color: umotor.sub, fontSize: 13 },
  retryBtn: { marginTop: 4, backgroundColor: umotor.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: umotor.faint, marginTop: 40 },
  footnote: { textAlign: 'center', color: umotor.faint, fontSize: 11, marginTop: 8 },
});
