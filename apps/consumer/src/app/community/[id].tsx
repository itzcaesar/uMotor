import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { getGroup, postsForGroup, TAG_COLOR, useCommunity } from '@/lib/community';

export default function CommunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = getGroup(id);

  const joined = useCommunity((s) => (group ? s.joined[group.id] : false));
  const liked = useCommunity((s) => s.liked);
  const toggleJoin = useCommunity((s) => s.toggleJoin);
  const toggleLike = useCommunity((s) => s.toggleLike);
  const likeCount = useCommunity((s) => s.likeCount);
  const addedComments = useCommunity((s) => s.addedComments);
  const r = useResponsive();

  if (!group) {
    return (
      <View style={styles.missing}>
        <Ionicons name="people-outline" size={40} color="#cbd5e1" />
        <Text style={styles.missingText}>Komunitas tidak ditemukan.</Text>
        <Pressable style={styles.missingBtn} onPress={() => router.replace('/(tabs)/community')}>
          <Text style={styles.missingBtnText}>Kembali ke komunitas</Text>
        </Pressable>
      </View>
    );
  }

  const posts = postsForGroup(group.id);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, tabletContainer(r)]}>
      <Card style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.groupIcon}>
            <Ionicons name={group.icon} size={26} color={colors.primary} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{group.name}</Text>
            <Text style={styles.members}>{group.members} anggota</Text>
          </View>
        </View>
        <Text style={styles.description}>{group.description}</Text>
        <Pressable
          style={[styles.joinBtn, joined && styles.joinedBtn]}
          onPress={() => toggleJoin(group.id)}
        >
          {joined && <Ionicons name="checkmark" size={16} color={colors.accent} />}
          <Text style={[styles.joinBtnText, joined && styles.joinedBtnText]}>
            {joined ? 'Tergabung' : 'Ikuti komunitas'}
          </Text>
        </Pressable>
      </Card>

      <Text style={styles.sectionTitle}>Postingan ({posts.length})</Text>
      {posts.map((p) => {
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
                  <Text style={[styles.metricText, isLiked && styles.metricActive]}>{likeCount(p)}</Text>
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
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { gap: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontWeight: '800', color: '#0b1727', fontSize: 17 },
  members: { color: '#667085', fontSize: 13 },
  description: { color: '#475467', fontSize: 13, lineHeight: 20 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  joinedBtn: { backgroundColor: '#e2f6ee' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  joinedBtnText: { color: colors.accent },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0b1727', marginTop: 4 },
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
  metricActive: { color: colors.danger },
  readMore: { marginLeft: 'auto', color: colors.primary, fontWeight: '700', fontSize: 12 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  missingText: { color: '#98a2b3', fontSize: 15 },
  missingBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  missingBtnText: { color: '#fff', fontWeight: '700' },
});
