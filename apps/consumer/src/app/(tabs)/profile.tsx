import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, formatRp, type MotoScore, type User } from '@umotor/shared';
import { Card, useResponsive } from '@/components/ui';
import { ASTRAPAY_LIVE, bindAstraPay, unbindAstraPay } from '@/lib/astrapay';
import { confirmDialog, notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { userId, logout } = useSession();
  const qc = useQueryClient();
  const r = useResponsive();
  const [binding, setBinding] = useState(false);

  const profile = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const [u, s, p] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId!).single(),
        supabase.from('motoscore').select('*').eq('user_id', userId!).single(),
        supabase.from('points').select('*').eq('user_id', userId!).single(),
      ]);
      return {
        user: u.data as User | null,
        score: s.data as MotoScore | null,
        points: (p.data as { balance: number } | null)?.balance ?? 0,
      };
    },
  });

  const d = profile.data;
  const bound = !!d?.user?.astrapay_bound_at;

  const onBind = async () => {
    if (!userId || binding) return;
    setBinding(true);
    try {
      const ok = await bindAstraPay(userId, {
        phone: d?.user?.phone ?? undefined,
        name: d?.user?.name ?? undefined,
      });
      if (ok) {
        qc.invalidateQueries({ queryKey: ['profile', userId] });
        notify('Akun terhubung', 'Wallet AstraPay siap dipakai — bayar tanpa login ulang.');
      }
    } catch (e) {
      notify('Gagal menghubungkan', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBinding(false);
    }
  };

  const onUnbind = () => {
    if (!userId || binding) return;
    confirmDialog(
      'Putuskan akun AstraPay?',
      'Pembayaran berikutnya akan meminta login ulang di webview AstraPay.',
      async () => {
        setBinding(true);
        try {
          await unbindAstraPay(userId);
          qc.invalidateQueries({ queryKey: ['profile', userId] });
          notify('Akun diputuskan', 'Akun AstraPay tidak lagi tertaut.');
        } catch (e) {
          notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
        } finally {
          setBinding(false);
        }
      },
      { confirmLabel: 'Putuskan', cancelLabel: 'Batal', destructive: true },
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, r.isTablet && styles.contentWide]}>
      <Card>
        {/* Long-press = hidden presenter tools (PRD 01 §8). */}
        <Pressable onLongPress={() => router.push('/demo-controls')} delayLongPress={600}>
          <Text style={styles.name}>{d?.user?.name ?? '…'}</Text>
          <Text style={styles.phone}>{d?.user?.phone ?? ''}</Text>
        </Pressable>
        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>Saldo AstraPay</Text>
          <Text style={styles.walletValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {d?.user ? formatRp(d.user.astrapay_balance) : '—'}
          </Text>
        </View>
      </Card>

      {/* AstraPay account binding (live integration only). */}
      {ASTRAPAY_LIVE && (
        <Card style={styles.bindCard}>
          <View style={styles.bindHeader}>
            <View style={[styles.bindIcon, bound && styles.bindIconOn]}>
              <Ionicons name={bound ? 'link' : 'link-outline'} size={18} color={bound ? colors.accent : colors.primary} />
            </View>
            <View style={styles.bindInfo}>
              <Text style={styles.bindTitle}>Akun AstraPay</Text>
              <Text style={styles.bindSub}>
                {bound
                  ? `Terhubung${d?.user?.astrapay_phone ? ` · ${d.user.astrapay_phone}` : ''}`
                  : 'Hubungkan agar bayar tanpa login ulang tiap transaksi'}
              </Text>
            </View>
            {bound && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
          </View>
          <Pressable
            style={[styles.bindBtn, bound && styles.bindBtnGhost, binding && styles.bindBtnBusy]}
            onPress={bound ? onUnbind : onBind}
            disabled={binding}
            accessibilityRole="button"
            accessibilityLabel={bound ? 'Putuskan akun AstraPay' : 'Hubungkan akun AstraPay'}
          >
            {binding ? (
              <ActivityIndicator color={bound ? colors.danger : '#fff'} />
            ) : (
              <Text style={[styles.bindBtnText, bound && styles.bindBtnTextGhost]}>
                {bound ? 'Putuskan akun' : 'Hubungkan AstraPay'}
              </Text>
            )}
          </Pressable>
        </Card>
      )}

      <Pressable onPress={() => router.push('/motoscore')}>
        <Card style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>MotoScore</Text>
          <Text style={styles.scoreValue}>{d?.score?.score ?? '—'}</Text>
          <Text style={styles.scoreHint}>300–850 · ketuk untuk detail & produk finansial</Text>
        </Card>
      </Pressable>

      <Card>
        <View style={styles.walletRow}>
          <Text style={styles.walletLabel}>MotoPoints</Text>
          <Text style={styles.pointsValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {d?.points.toLocaleString('id-ID') ?? '—'}
          </Text>
        </View>
      </Card>

      <Pressable
        style={styles.logout}
        onPress={() => {
          logout();
          router.replace('/login');
        }}
      >
        <Text style={styles.logoutText}>Keluar</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  contentWide: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  name: { fontSize: 20, fontWeight: '800', color: '#0b1727' },
  phone: { color: '#667085', marginTop: 2 },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  walletLabel: { color: '#667085' },
  walletValue: { fontWeight: '800', fontSize: 16, color: colors.primary },
  bindCard: { gap: 12 },
  bindHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bindIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef4fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bindIconOn: { backgroundColor: '#e2f6ee' },
  bindInfo: { flex: 1, gap: 2 },
  bindTitle: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  bindSub: { color: '#667085', fontSize: 12, lineHeight: 16 },
  bindBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  bindBtnGhost: { backgroundColor: '#fdecec' },
  bindBtnBusy: { opacity: 0.6 },
  bindBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bindBtnTextGhost: { color: colors.danger },
  scoreCard: { alignItems: 'center', paddingVertical: 24 },
  scoreLabel: { color: '#667085', fontWeight: '600' },
  scoreValue: { fontSize: 56, fontWeight: '800', color: colors.accent, marginTop: 4 },
  scoreHint: { fontSize: 12, color: '#98a2b3', marginTop: 4 },
  pointsValue: { fontWeight: '800', fontSize: 16, color: '#0b1727' },
  logout: { alignItems: 'center', padding: 14 },
  logoutText: { color: colors.danger, fontWeight: '700' },
});
