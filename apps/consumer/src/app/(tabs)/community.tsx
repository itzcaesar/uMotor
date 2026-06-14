import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { POSTS, TAG_COLOR, useCommunity } from '@/lib/community';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Redeemable MotoPoints rewards (demo). Cost is deducted from the live points balance.
const REWARDS = [
  { id: 'service', title: 'Diskon servis Rp 25.000', cost: 2000, icon: 'construct' as const },
  { id: 'cashback', title: 'Cashback AstraPay Rp 10.000', cost: 1000, icon: 'wallet' as const },
  { id: 'merch', title: 'Voucher merchandise', cost: 5000, icon: 'shirt' as const },
];

export default function Community() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();

  const liked = useCommunity((s) => s.liked);
  const toggleLike = useCommunity((s) => s.toggleLike);
  const likeCount = useCommunity((s) => s.likeCount);
  // Subscribe to addedComments so the feed count updates after a comment is
  // posted on a detail screen (the tab stays mounted underneath).
  const addedComments = useCommunity((s) => s.addedComments);

  const [redeeming, setRedeeming] = useState<string | null>(null);
  const r = useResponsive();

  const loyalty = useQuery({
    queryKey: ['loyalty', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('points').select('balance').eq('user_id', userId!).single();
      return (data as { balance: number } | null)?.balance ?? 0;
    },
  });

  const balance = loyalty.data ?? 0;

  const redeem = (reward: (typeof REWARDS)[number]) => {
    if (!userId || redeeming) return;
    if (balance < reward.cost) {
      Alert.alert('Poin belum cukup', `Butuh ${reward.cost.toLocaleString('id-ID')} MotoPoints untuk menukar ${reward.title}.`);
      return;
    }
    Alert.alert('Tukar poin?', `${reward.cost.toLocaleString('id-ID')} MotoPoints untuk "${reward.title}".`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tukar',
        onPress: async () => {
          setRedeeming(reward.id);
          try {
            const { error } = await supabase
              .from('points')
              .update({ balance: balance - reward.cost })
              .eq('user_id', userId);
            if (error) throw error;
            // Ledger entry so the balance change is auditable like RPC-driven ones.
            await supabase.from('points_history').insert({
              user_id: userId,
              delta: -reward.cost,
              reason: `Tukar poin: ${reward.title}`,
            });
            qc.invalidateQueries({ queryKey: ['loyalty', userId] });
            Alert.alert('Berhasil ditukar', `${reward.title} masuk ke akunmu. Cek di AstraPay.`);
          } catch (e) {
            Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
          } finally {
            setRedeeming(null);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      {/* Loyalty header (real MotoPoints balance) */}
      <Card style={styles.loyalty}>
        <View style={styles.loyaltyTop}>
          <View>
            <Text style={styles.loyaltyLabel}>MotoPoints kamu</Text>
            <Text style={styles.loyaltyValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {loyalty.data != null ? balance.toLocaleString('id-ID') : '—'}
            </Text>
          </View>
          <Ionicons name="star" size={36} color="#f5a623" />
        </View>
        <Text style={styles.loyaltyHint}>
          Tukar poin jadi diskon servis, cashback AstraPay, atau merchandise.
        </Text>
      </Card>

      {/* Rewards redemption */}
      <Text style={styles.sectionTitle}>Tukar poin</Text>
      {REWARDS.map((r) => {
        const affordable = balance >= r.cost;
        return (
          <Card key={r.id} style={styles.rewardRow}>
            <View style={[styles.rewardIcon, !affordable && styles.rewardIconLocked]}>
              <Ionicons name={r.icon} size={20} color={affordable ? colors.primary : '#98a2b3'} />
            </View>
            <View style={styles.rewardInfo}>
              <Text style={styles.rewardTitle}>{r.title}</Text>
              <Text style={styles.rewardCost}>{r.cost.toLocaleString('id-ID')} poin</Text>
            </View>
            <Pressable
              style={[styles.redeemBtn, (!affordable || redeeming === r.id) && styles.redeemBtnDisabled]}
              onPress={() => redeem(r)}
              disabled={!affordable || !!redeeming}
            >
              <Text style={[styles.redeemText, !affordable && styles.redeemTextDisabled]}>
                {redeeming === r.id ? '…' : 'Tukar'}
              </Text>
            </Pressable>
          </Card>
        );
      })}

      <Text style={styles.sectionTitle}>Feed terbaru</Text>
      {POSTS.map((p) => {
        const isLiked = liked[p.id];
        return (
          <Pressable key={p.id} onPress={() => router.push(`/community/post/${p.id}`)}>
            <Card style={styles.post}>
              <View style={styles.postHead}>
                <Text style={styles.postAuthor}>{p.author}</Text>
                <View style={[styles.tag, { backgroundColor: (TAG_COLOR[p.tag] ?? colors.primary) + '22' }]}>
                  <Text style={[styles.tagText, { color: TAG_COLOR[p.tag] ?? colors.primary }]}>
                    {p.tag}
                  </Text>
                </View>
              </View>
              <Text style={styles.postTime}>{p.time}</Text>
              <Text style={styles.postTitle}>{p.title}</Text>
              <Text style={styles.postBody} numberOfLines={2}>
                {p.preview}
              </Text>
              <View style={styles.postFooter}>
                <Pressable style={styles.metric} onPress={() => toggleLike(p.id)} hitSlop={6}>
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={16}
                    color={isLiked ? colors.danger : '#667085'}
                  />
                  <Text style={[styles.metricText, isLiked && styles.metricTextActive]}>
                    {likeCount(p)}
                  </Text>
                </Pressable>
                <View style={styles.metric}>
                  <Ionicons name="chatbubble-outline" size={15} color="#667085" />
                  <Text style={styles.metricText}>
                    {p.comments.length + (addedComments[p.id]?.length ?? 0)}
                  </Text>
                </View>
                <Text style={styles.readMore}>Baca →</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  loyalty: { backgroundColor: '#0b1727', borderColor: '#0b1727', gap: 8 },
  loyaltyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loyaltyLabel: { color: '#9aa7b8', fontSize: 13, fontWeight: '600' },
  loyaltyValue: { color: '#fff', fontSize: 34, fontWeight: '800' },
  loyaltyHint: { color: '#9aa7b8', fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rewardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardIconLocked: { backgroundColor: '#eef1f6' },
  rewardInfo: { flex: 1, gap: 2 },
  rewardTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  rewardCost: { color: '#667085', fontSize: 12 },
  redeemBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  redeemBtnDisabled: { backgroundColor: '#eef1f6' },
  redeemText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  redeemTextDisabled: { color: '#98a2b3' },
  post: { gap: 4 },
  postHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postAuthor: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700' },
  postTime: { color: '#98a2b3', fontSize: 11 },
  postTitle: { fontWeight: '800', color: '#0b1727', fontSize: 15, marginTop: 2 },
  postBody: { color: '#475467', fontSize: 13, lineHeight: 19, marginTop: 2 },
  postFooter: { flexDirection: 'row', gap: 18, marginTop: 8, alignItems: 'center' },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricText: { color: '#667085', fontSize: 13, fontWeight: '600' },
  metricTextActive: { color: colors.danger },
  readMore: { marginLeft: 'auto', color: colors.primary, fontWeight: '700', fontSize: 12 },
});
