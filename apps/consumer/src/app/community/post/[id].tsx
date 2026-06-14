import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { getGroup, getPost, TAG_COLOR, useCommunity } from '@/lib/community';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = getPost(id);

  const liked = useCommunity((s) => (post ? s.liked[post.id] : false));
  const toggleLike = useCommunity((s) => s.toggleLike);
  const addComment = useCommunity((s) => s.addComment);
  const likeCount = useCommunity((s) => s.likeCount);
  const commentsFor = useCommunity((s) => s.commentsFor);

  const [draft, setDraft] = useState('');
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  if (!post) {
    return (
      <View style={styles.missing}>
        <Ionicons name="document-outline" size={40} color="#cbd5e1" />
        <Text style={styles.missingText}>Postingan tidak ditemukan.</Text>
        <Pressable style={styles.missingBtn} onPress={() => router.replace('/(tabs)/community')}>
          <Text style={styles.missingBtnText}>Kembali ke komunitas</Text>
        </Pressable>
      </View>
    );
  }

  const group = getGroup(post.groupId);
  const comments = commentsFor(post);
  const tagColor = TAG_COLOR[post.tag] ?? colors.primary;

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(post.id, body);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={[styles.content, tabletContainer(r)]} keyboardShouldPersistTaps="handled">
        <Card style={styles.postCard}>
          <View style={styles.postHead}>
            <Text style={styles.author}>{post.author}</Text>
            <View style={[styles.tag, { backgroundColor: tagColor + '22' }]}>
              <Text style={[styles.tagText, { color: tagColor }]}>{post.tag}</Text>
            </View>
          </View>
          <Text style={styles.time}>{post.time}</Text>
          <Text style={styles.title}>{post.title}</Text>
          <Text style={styles.body}>{post.body}</Text>

          {group && (
            <Pressable style={styles.groupChip} onPress={() => router.push(`/community/${group.id}`)}>
              <Ionicons name={group.icon} size={14} color={colors.primary} />
              <Text style={styles.groupChipText}>{group.name}</Text>
            </Pressable>
          )}

          <View style={styles.metrics}>
            <Pressable style={styles.metric} onPress={() => toggleLike(post.id)} hitSlop={6}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={18}
                color={liked ? colors.danger : '#667085'}
              />
              <Text style={[styles.metricText, liked && styles.metricActive]}>{likeCount(post)}</Text>
            </Pressable>
            <View style={styles.metric}>
              <Ionicons name="chatbubble-outline" size={16} color="#667085" />
              <Text style={styles.metricText}>{comments.length}</Text>
            </View>
          </View>
        </Card>

        <Text style={styles.commentsHeading}>{comments.length} komentar</Text>
        {comments.map((c) => (
          <Card key={c.id} style={styles.comment}>
            <View style={styles.commentHead}>
              <Text style={styles.commentAuthor}>{c.author}</Text>
              <Text style={styles.commentTime}>{c.time}</Text>
            </View>
            <Text style={styles.commentBody}>{c.body}</Text>
          </Card>
        ))}
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: Math.max(8, insets.bottom) }, tabletContainer(r)]}>
        <TextInput
          style={styles.input}
          placeholder="Tulis komentar…"
          placeholderTextColor="#98a2b3"
          value={draft}
          onChangeText={setDraft}
          multiline
          onSubmitEditing={submit}
        />
        <Pressable
          style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
          onPress={submit}
          disabled={!draft.trim()}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  postCard: { gap: 6 },
  postHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700' },
  time: { color: '#98a2b3', fontSize: 11 },
  title: { fontWeight: '800', color: '#0b1727', fontSize: 18, marginTop: 2, lineHeight: 24 },
  body: { color: '#344054', fontSize: 14, lineHeight: 21, marginTop: 4 },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#eef4fd',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  groupChipText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  metrics: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricText: { color: '#667085', fontSize: 14, fontWeight: '600' },
  metricActive: { color: colors.danger },
  commentsHeading: { fontSize: 14, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  comment: { gap: 3 },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentAuthor: { fontWeight: '700', color: '#0b1727', fontSize: 13 },
  commentTime: { color: '#98a2b3', fontSize: 11 },
  commentBody: { color: '#475467', fontSize: 13, lineHeight: 19 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e9f0',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: '#f3f6fb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0b1727',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#c2cad6' },
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
