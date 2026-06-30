import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { Workshop, WorkshopType } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, SectionTitle, astra, colors, ErrorState, figAssets, useResponsive } from '@/components/ui';
import { confirmDialog, notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TYPES: { key: WorkshopType; label: string }[] = [
  { key: 'independent', label: 'Bengkel Umum' },
  { key: 'ahass', label: 'AHASS' },
];

export default function Profile() {
  const workshopId = useSession((s) => s.workshopId);
  const logout = useSession((s) => s.logout);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const r = useResponsive();

  const q = useQuery({
    queryKey: ['workshop', workshopId],
    enabled: !!workshopId,
    queryFn: async () => {
      const { data, error } = await supabase.from('workshops').select('*').eq('id', workshopId!).single();
      if (error) throw error;
      return data as Workshop;
    },
  });

  // Editable form state, seeded once the workshop loads.
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkshopType>('independent');
  const [address, setAddress] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [homeService, setHomeService] = useState(false);
  const [homeFee, setHomeFee] = useState('30000');
  const [homeRadius, setHomeRadius] = useState('10');

  useEffect(() => {
    const w = q.data;
    if (!w) return;
    setName(w.name);
    setType(w.type);
    setAddress(w.address ?? '');
    setPriceMin(String(w.price_estimate_min ?? ''));
    setPriceMax(String(w.price_estimate_max ?? ''));
    setHomeService(w.home_service);
    if (w.home_service_fee != null) setHomeFee(String(w.home_service_fee));
    if (w.home_service_radius_km != null) setHomeRadius(String(w.home_service_radius_km));
  }, [q.data]);

  const save = async () => {
    if (!workshopId || busy) return;
    if (!name.trim() || !address.trim()) {
      notify('Lengkapi data', 'Nama bengkel dan alamat wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('workshops')
        .update({
          name: name.trim(),
          type,
          address: address.trim(),
          price_estimate_min: Number(priceMin) || 0,
          price_estimate_max: Number(priceMax) || 0,
          home_service: homeService,
          home_service_fee: homeService ? Number(homeFee) || 0 : null,
          home_service_radius_km: homeService ? Number(homeRadius) || 0 : null,
        })
        .eq('id', workshopId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['workshop', workshopId] });
      qc.invalidateQueries({ queryKey: ['dashboard', workshopId] });
      notify('Tersimpan', 'Profil bengkel diperbarui. Perubahan langsung tampil di aplikasi pelanggan.');
    } catch (e) {
      notify('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const confirmLogout = () => {
    confirmDialog(
      'Keluar',
      'Keluar dari akun bengkel ini?',
      () => {
        logout();
        router.replace('/login');
      },
      { confirmLabel: 'Keluar', destructive: true },
    );
  };

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={astra.primary} />
        <Text style={styles.muted}>Memuat profil…</Text>
      </View>
    );
  }
  if (q.isError || !q.data) {
    return (
      <View style={styles.center}>
        <ErrorState onRetry={() => q.refetch()} />
      </View>
    );
  }

  const w = q.data;
  const typeLabel = TYPES.find((t) => t.key === w.type)?.label ?? 'Bengkel Umum';
  const tierLabel = w.tier === 'premium' ? 'Premium' : 'Basic';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(40, insets.bottom + 16) },
          r.isTablet && styles.contentWide,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Blue identity header (Figma "Profile" card) */}
        <View style={styles.identity}>
          <View style={styles.identityGlow} pointerEvents="none" />
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={2}>
              {w.name}
            </Text>
            <Text style={styles.identitySub} numberOfLines={1}>
              {typeLabel} · Tier {tierLabel}
            </Text>
          </View>
          <Image source={figAssets.icGarage} style={styles.identityIllus} resizeMode="contain" />
        </View>

        {/* Read-only stats — blue-accented summary cards */}
        <Card style={styles.statRow}>
          <Stat icon="star" tint="#f5a623" label="Rating" value={Number(w.rating).toFixed(1)} />
          <View style={styles.statDivider} />
          <Stat icon="ribbon" tint={astra.primary} label="Tier" value={tierLabel} />
          <View style={styles.statDivider} />
          <Stat
            icon="navigate"
            tint={colors.accent}
            label="Jarak"
            value={w.distance_km != null ? `${w.distance_km} km` : '—'}
          />
        </Card>

        {/* Editable profile */}
        <SectionTitle>Profil bengkel</SectionTitle>
        <Card style={styles.card}>
          <Field label="Nama bengkel" value={name} onChangeText={setName} placeholder="Nama bengkel" />

          <Text style={styles.label}>Jenis bengkel</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => {
              const active = t.key === type;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.typeBox, active && styles.typeActive]}
                  onPress={() => setType(t.key)}
                >
                  <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field label="Alamat" value={address} onChangeText={setAddress} placeholder="Jl. ... , Bandung" multiline />

          <Text style={styles.label}>Estimasi harga servis (Rp)</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={priceMin}
              onChangeText={setPriceMin}
              keyboardType="number-pad"
              placeholderTextColor={astra.faint}
            />
            <Text style={styles.priceDash}>—</Text>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={priceMax}
              onChangeText={setPriceMax}
              keyboardType="number-pad"
              placeholderTextColor={astra.faint}
            />
          </View>
        </Card>

        {/* Home service */}
        <SectionTitle>Layanan home service</SectionTitle>
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Aktifkan home service</Text>
              <Text style={styles.switchSub}>Mekanik datang ke lokasi pelanggan</Text>
            </View>
            <Switch
              value={homeService}
              onValueChange={setHomeService}
              trackColor={{ true: astra.primary, false: '#cfd5df' }}
            />
          </View>
          {homeService && (
            <View style={styles.homeFields}>
              <View style={styles.homeField}>
                <Text style={styles.label}>Biaya (Rp)</Text>
                <TextInput
                  style={styles.input}
                  value={homeFee}
                  onChangeText={setHomeFee}
                  keyboardType="number-pad"
                  placeholderTextColor={astra.faint}
                />
              </View>
              <View style={styles.homeField}>
                <Text style={styles.label}>Radius (km)</Text>
                <TextInput
                  style={styles.input}
                  value={homeRadius}
                  onChangeText={setHomeRadius}
                  keyboardType="number-pad"
                  placeholderTextColor={astra.faint}
                />
              </View>
            </View>
          )}
        </Card>

        <Pressable style={[styles.saveBtn, busy && styles.saveBusy]} onPress={save} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.saveText}>Simpan perubahan</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Keluar akun</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({
  icon,
  tint,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Field({
  label,
  multiline,
  ...input
}: { label: string; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor={astra.faint}
        multiline={multiline}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: astra.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  contentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  muted: { color: astra.faint, fontSize: 14 },

  // Blue identity header (Figma "Profile" card)
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: astra.heroDark,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
    minHeight: 96,
  },
  identityGlow: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: astra.heroMid,
    opacity: 0.55,
  },
  identityText: { flex: 1, gap: 4, zIndex: 1 },
  identityName: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 27 },
  identitySub: { color: astra.onHero, fontSize: 13, fontWeight: '600' },
  identityIllus: { width: 76, height: 76, marginLeft: 8, zIndex: 1 },

  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: astra.line, marginVertical: 4 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 18, fontWeight: '800', color: astra.ink },
  statLabel: { fontSize: 11, color: astra.sub },

  card: { gap: 4 },
  label: { fontWeight: '700', color: astra.ink, marginTop: 10, marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: astra.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: astra.ink,
    borderWidth: 1,
    borderColor: astra.line,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: astra.bg,
    borderWidth: 1.5,
    borderColor: astra.line,
  },
  typeActive: { borderColor: astra.primary, backgroundColor: '#eef4fd' },
  typeLabel: { fontWeight: '800', color: astra.ink, fontSize: 14 },
  typeLabelActive: { color: astra.primary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceInput: { flex: 1 },
  priceDash: { color: astra.faint, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontWeight: '700', color: astra.ink, fontSize: 14 },
  switchSub: { color: astra.sub, fontSize: 12 },
  homeFields: { flexDirection: 'row', gap: 12, marginTop: 4 },
  homeField: { flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    backgroundColor: astra.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  saveBusy: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
