import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatRp } from '@umotor/shared';
import { Illustration } from '@/components/Illustration';
import { umotor, useResponsive } from '@/components/ui';
import { FadeInView, PressableScale } from '@/components/motion';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Bill {
  id: string;
  type: 'stnk' | 'fuel' | 'installment';
  name: string;
  amount: number;
  due_date: string;
  paid: boolean;
}

const coinsIcon = require('../../../assets/figma/ic-coins.png');
const motorcycleIcon = require('../../../assets/figma/nav-motorcycle.png');

export default function FinanceHub() {
  const userId = useSession((s) => s.userId);
  const r = useResponsive();
  const insets = useSafeAreaInsets();

  const contentW = Math.min(r.width, 460);
  const s = contentW / 402;
  const px = (n: number) => n * s;

  const data = useQuery({
    queryKey: ['finance', userId],
    enabled: !!userId,
    refetchInterval: 25_000,
    queryFn: async () => {
      const [bills, spend, user] = await Promise.all([
        supabase.from('bills').select('*').eq('user_id', userId!).order('paid').order('due_date'),
        supabase
          .from('payments')
          .select('amount')
          .eq('user_id', userId!)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from('users').select('astrapay_balance').eq('id', userId!).single(),
      ]);
      return {
        bills: (bills.data ?? []) as Bill[],
        monthSpend: (spend.data ?? []).reduce((sum: number, p: { amount: number }) => sum + (p.amount ?? 0), 0),
        balance: (user.data as { astrapay_balance: number } | null)?.astrapay_balance ?? 0,
      };
    },
  });

  const { taxBills, otherBills, dueTotal, unpaidCount } = useMemo(() => {
    const all = data.data?.bills ?? [];
    const allUnpaid = all.filter((b) => !b.paid);
    return {
      taxBills: all.filter((b) => b.type === 'stnk'),
      otherBills: all.filter((b) => b.type !== 'stnk'),
      dueTotal: allUnpaid.reduce((sum, b) => sum + b.amount, 0),
      unpaidCount: allUnpaid.length,
    };
  }, [data.data?.bills]);

  const monthLabel = new Date().toLocaleDateString('id-ID', { month: 'long' });
  const openBill = (b: Bill) => router.push(`/finance/bill/${b.id}`);

  const tiles = [
    { key: 'tabungan', label: 'Tabungan', icon: coinsIcon, onPress: () => notify('Tabungan', 'Fitur tabungan AstraPay segera hadir.') },
    { key: 'topup', label: 'Top Up', glyph: '+', onPress: () => notify('Top Up', 'Isi saldo di aplikasi AstraPay — saldo terbaru otomatis terbaca di sini.') },
    { key: 'tarik', label: 'Tarik Tunai', ion: 'arrow-down' as const, onPress: () => notify('Tarik Tunai', 'Penarikan saldo dilakukan langsung di aplikasi AstraPay.') },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} />}
      >
        {/* ── Navy hero ── */}
        <View style={[styles.hero, { paddingTop: insets.top + px(28), paddingBottom: px(46), borderBottomLeftRadius: px(24), borderBottomRightRadius: px(24) }]}>
          <View style={{ pointerEvents: 'none', position: 'absolute', left: px(6), bottom: px(2), opacity: 0.9 }}>
            <Illustration name="wallet" width={px(70)} />
          </View>
          <View style={{ pointerEvents: 'none', position: 'absolute', right: px(8), top: insets.top + px(40), opacity: 0.9 }}>
            <Illustration name="currency" width={px(58)} />
          </View>

          <View style={{ paddingHorizontal: px(36) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(8) }}>
              <Image source={require('../../../assets/figma/astrapay-mark.png')} style={{ width: px(20), height: px(18) }} contentFit="contain" tintColor={'#fff'} />
              <Text style={{ color: '#fff', fontSize: px(20), fontWeight: '500' }}>Saldo AstraPay</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: px(10) }}>
              <Text style={{ color: '#fff', fontSize: px(15), fontWeight: '700', marginTop: px(8), marginRight: px(4) }}>Rp</Text>
              <Text style={{ color: '#fff', fontSize: px(54), lineHeight: px(60), fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {data.data ? formatRp(data.data.balance).replace('Rp', '').trim() : '…'}
              </Text>
            </View>
            <Text style={{ color: '#cfe0f7', fontSize: px(12), marginTop: px(8), textAlign: 'center' }}>
              <Text style={{ fontWeight: '700' }}>{data.data ? formatRp(data.data.monthSpend) : '…'}</Text>
              {` terpakai di bulan ${monthLabel}`}
            </Text>
          </View>
        </View>

        {/* ── 3 wallet action tiles (overlap hero bottom) ── */}
        <View style={[styles.tilesRow, { marginTop: -px(26), paddingHorizontal: px(40) }]}>
          {tiles.map((t, i) => (
            <FadeInView key={t.key} index={i} step={50} style={styles.tileCol}>
              <PressableScale style={styles.tileBtn} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.label}>
                <View style={[styles.tile, { width: px(48), height: px(48), borderRadius: px(16) }]}>
                  {t.glyph ? (
                    <Text style={{ fontSize: px(34), lineHeight: px(40), color: umotor.primary, fontWeight: '500' }}>{t.glyph}</Text>
                  ) : t.ion ? (
                    <Ionicons name={t.ion} size={px(24)} color={umotor.primary} />
                  ) : (
                    <Image source={t.icon} style={{ width: px(26), height: px(26) }} contentFit="contain" tintColor={umotor.primary} />
                  )}
                </View>
                <Text style={{ fontSize: px(10), color: umotor.heroDark, fontWeight: '600', marginTop: px(7) }}>{t.label}</Text>
              </PressableScale>
            </FadeInView>
          ))}
        </View>

        <View style={{ paddingHorizontal: px(18), marginTop: px(18), gap: px(12) }}>
          {/* unpaid alert */}
          {unpaidCount > 0 && (
            <FadeInView>
              <PressableScale
                style={[styles.alert, { borderRadius: px(24), height: px(49), paddingHorizontal: px(6) }]}
                onPress={() => taxBills[0] && openBill(taxBills.find((b) => !b.paid) ?? taxBills[0])}
              >
                <View style={[styles.alertBadge, { width: px(37), height: px(37), borderRadius: px(19) }]}>
                  <Text style={{ color: '#f14e4e', fontSize: px(26), fontWeight: '800' }}>!</Text>
                </View>
                <View style={{ flex: 1, marginLeft: px(10) }}>
                  <Text style={{ fontSize: px(13), color: 'rgba(0,0,0,0.7)', fontWeight: '600' }}>{unpaidCount} Tagihan belum dibayar!</Text>
                  <Text style={{ fontSize: px(11), color: 'rgba(0,0,0,0.4)', marginTop: px(2) }}>
                    Total <Text style={{ fontWeight: '600' }}>{formatRp(dueTotal)}</Text> menunggu pembayaran
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={px(20)} color="rgba(0,0,0,0.5)" style={{ marginRight: px(8) }} />
              </PressableScale>
            </FadeInView>
          )}

          {/* Pajak & STNK */}
          {taxBills.length > 0 && (
            <>
              <SectionTitle px={px}>Pajak & STNK</SectionTitle>
              {taxBills.map((b, i) => (
                <FadeInView key={b.id} index={i}>
                  <TaxCard bill={b} px={px} icon={motorcycleIcon} onOpen={() => openBill(b)} />
                </FadeInView>
              ))}
            </>
          )}

          {/* Other bills */}
          {otherBills.length > 0 && (
            <>
              <SectionTitle px={px}>Tagihan lain</SectionTitle>
              {otherBills.map((b, i) => (
                <FadeInView key={b.id} index={i}>
                  <PressableScale style={[styles.billRow, { borderRadius: px(14), padding: px(14) }]} onPress={() => openBill(b)}>
                    <View style={[styles.billIcon, { width: px(38), height: px(38), borderRadius: px(12) }]}>
                      <Ionicons name={b.type === 'fuel' ? 'water' : 'card'} size={px(18)} color={umotor.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: px(12) }}>
                      <Text style={{ fontSize: px(13), fontWeight: '700', color: umotor.ink }}>{b.name}</Text>
                      <Text style={{ fontSize: px(11), color: b.paid ? '#4ecb9b' : umotor.sub, marginTop: px(2) }}>
                        {b.paid ? 'Lunas' : `Jatuh tempo ${new Date(b.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long' })}`}
                      </Text>
                    </View>
                    <Text style={{ fontSize: px(13), fontWeight: '800', color: umotor.ink }}>{formatRp(b.amount)}</Text>
                  </PressableScale>
                </FadeInView>
              ))}
            </>
          )}

          {data.isLoading && <Text style={styles.empty}>Memuat tagihan…</Text>}
          {!data.isLoading && (data.data?.bills.length ?? 0) === 0 && <Text style={styles.empty}>Tidak ada tagihan.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ children, px }: { children: React.ReactNode; px: (n: number) => number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(12), marginTop: px(8) }}>
      <Text style={{ fontSize: px(16), fontWeight: '800', color: umotor.heroDark }}>{children}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: '#c4dcfb' }} />
    </View>
  );
}

function TaxCard({ bill, px, icon, onOpen }: { bill: Bill; px: (n: number) => number; icon: number; onOpen: () => void }) {
  const days = Math.ceil((new Date(bill.due_date).getTime() - Date.now()) / 86400000);
  return (
    <PressableScale style={[styles.taxCard, { borderRadius: px(15), padding: px(14) }]} onPress={onOpen}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.taxIcon, { width: px(48), height: px(48), borderRadius: px(24) }]}>
          <Image source={icon} style={{ width: px(28), height: px(28) }} contentFit="contain" tintColor={umotor.heroDark} />
        </View>
        <View style={{ flex: 1, marginLeft: px(14) }}>
          <Text style={{ fontSize: px(14), fontWeight: '500', color: 'rgba(0,0,0,0.7)' }}>{bill.name}</Text>
          <Text style={{ fontSize: px(10), color: 'rgba(0,0,0,0.4)', marginTop: px(3) }}>
            {bill.paid ? 'Lunas tahun ini' : `Bayar sebelum ${new Date(bill.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}!`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: px(13), fontWeight: '800', color: 'rgba(0,0,0,0.55)' }}>{formatRp(bill.amount)}</Text>
          {!bill.paid && days >= 0 && <Text style={{ fontSize: px(8), color: 'rgba(0,0,0,0.34)', marginTop: px(4) }}>{days} Hari lagi</Text>}
        </View>
      </View>
      <View style={[styles.payBtn, { borderRadius: px(11), height: px(37), marginTop: px(12) }]}>
        <Ionicons name={bill.paid ? 'receipt-outline' : 'wallet'} size={px(16)} color="#fff" />
        <Text style={{ color: '#fff', fontSize: px(14), fontWeight: '700', marginLeft: px(8) }}>
          {bill.paid ? 'Lihat rincian' : 'Lihat rincian & Bayar'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: umotor.bg },
  hero: { backgroundColor: umotor.heroDark, overflow: 'hidden' },
  tilesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tileCol: { alignItems: 'center', flex: 1 },
  tileBtn: { alignItems: 'center' },
  tile: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 3px 8px rgba(11,23,39,0.1)',
    elevation: 3,
  },
  alert: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8e7bb', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.2)' },
  alertBadge: { backgroundColor: '#ffdc87', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.2)' },
  taxCard: { backgroundColor: '#d0e4ff' },
  taxIcon: { backgroundColor: '#adc6e8', alignItems: 'center', justifyContent: 'center' },
  payBtn: { backgroundColor: umotor.heroDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  billRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: umotor.line },
  billIcon: { backgroundColor: umotor.tile, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: umotor.faint, marginTop: 24 },
});
