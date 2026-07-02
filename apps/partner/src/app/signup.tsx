import { useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';
import type { WorkshopType } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, colors, useResponsive } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Bandung city centre — generated workshops scatter slightly around it so they
// land on the Console map and read as "nearby" in the consumer booking list.
const BANDUNG = { lat: -6.9175, lng: 107.6191 };

const TYPES: { key: WorkshopType; label: string; hint: string }[] = [
  { key: 'independent', label: 'Bengkel Umum', hint: 'Independen / non-AHASS' },
  { key: 'ahass', label: 'AHASS', hint: 'Bengkel resmi Honda' },
];

/** 7 days × 09:00–16:00 hourly slots so a new workshop is bookable immediately. */
function buildSlots(workshopId: string) {
  const rows: { workshop_id: string; slot_at: string; capacity: number }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let d = 0; d < 7; d++) {
    for (let h = 9; h <= 16; h++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + d);
      dt.setHours(h);
      rows.push({ workshop_id: workshopId, slot_at: dt.toISOString(), capacity: 1 });
    }
  }
  return rows;
}

export default function Signup() {
  const loginAs = useSession((s) => s.loginAs);
  const [name, setName] = useState('');
  const [type, setType] = useState<WorkshopType>('independent');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [priceMin, setPriceMin] = useState('40000');
  const [priceMax, setPriceMax] = useState('120000');
  const [homeService, setHomeService] = useState(false);
  const [homeFee, setHomeFee] = useState('30000');
  const [homeRadius, setHomeRadius] = useState('10');
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const r = useResponsive();

  const submit = async () => {
    if (busy) return;
    if (!name.trim() || !owner.trim() || !phone.trim() || !address.trim()) {
      notify('Lengkapi data', 'Nama bengkel, pemilik, telepon, dan alamat wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const jitter = () => (Math.random() - 0.5) * 0.06; // ~±3 km
      const { data: ws, error } = await supabase
        .from('workshops')
        .insert({
          name: name.trim(),
          type,
          tier: 'basic',
          rating: 5.0,
          address: address.trim(),
          lat: BANDUNG.lat + jitter(),
          lng: BANDUNG.lng + jitter(),
          distance_km: Math.round((0.8 + Math.random() * 5) * 10) / 10,
          price_estimate_min: Number(priceMin) || 0,
          price_estimate_max: Number(priceMax) || 0,
          home_service: homeService,
          home_service_radius_km: homeService ? Number(homeRadius) || 0 : null,
          home_service_fee: homeService ? Number(homeFee) || 0 : null,
        })
        .select()
        .single();
      if (error) throw error;

      // Open the next 7 days of slots so consumers can book right away.
      const { error: slotErr } = await supabase.from('slots').insert(buildSlots(ws.id));
      if (slotErr) throw slotErr;

      loginAs(ws.id);
      notify(
        'Bengkel terdaftar!',
        `${ws.name} kini menjadi mitra uMotor. Jadwal 7 hari ke depan sudah dibuka.`,
      );
      router.replace('/(tabs)');
    } catch (e) {
      notify('Gagal mendaftar', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(40, insets.bottom + 16) },
          r.isTablet && styles.contentWide,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Ionicons name="storefront" size={22} color={colors.primary} />
          <Text style={styles.introText}>
            Daftarkan bengkel Anda dan langsung terima booking dari ekosistem uMotor.
          </Text>
        </View>

        <Card style={styles.card}>
          <Field label="Nama bengkel" value={name} onChangeText={setName} placeholder="Bengkel Maju Jaya" />

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
                  <Text style={[styles.typeHint, active && styles.typeHintActive]}>{t.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field label="Nama pemilik" value={owner} onChangeText={setOwner} placeholder="Nama lengkap" />
          <Field
            label="No. telepon"
            value={phone}
            onChangeText={setPhone}
            placeholder="0812-3456-7890"
            keyboardType="phone-pad"
          />
          <Field
            label="Alamat"
            value={address}
            onChangeText={setAddress}
            placeholder="Jl. ... , Bandung"
            multiline
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Estimasi harga servis (Rp)</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={priceMin ? Number(priceMin).toLocaleString('id-ID') : ''}
              onChangeText={(t) => setPriceMin(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="40.000"
              placeholderTextColor="#98a2b3"
            />
            <Text style={styles.priceDash}>—</Text>
            <TextInput
              style={[styles.input, styles.priceInput]}
              value={priceMax ? Number(priceMax).toLocaleString('id-ID') : ''}
              onChangeText={(t) => setPriceMax(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="120.000"
              placeholderTextColor="#98a2b3"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Layanan home service</Text>
              <Text style={styles.switchSub}>Mekanik datang ke lokasi pelanggan</Text>
            </View>
            <Switch
              value={homeService}
              onValueChange={setHomeService}
              trackColor={{ true: colors.primary, false: '#cfd5df' }}
            />
          </View>

          {homeService && (
            <View style={styles.homeFields}>
              <View style={styles.homeField}>
                <Text style={styles.label}>Biaya (Rp)</Text>
                <TextInput
                  style={styles.input}
                  value={homeFee ? Number(homeFee).toLocaleString('id-ID') : ''}
                  onChangeText={(t) => setHomeFee(t.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder="30.000"
                  placeholderTextColor="#98a2b3"
                />
              </View>
              <View style={styles.homeField}>
                <Text style={styles.label}>Radius (km)</Text>
                <TextInput
                  style={styles.input}
                  value={homeRadius}
                  onChangeText={setHomeRadius}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#98a2b3"
                />
              </View>
            </View>
          )}
        </Card>

        <Pressable style={[styles.submit, busy && styles.submitBusy]} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Daftar & mulai terima booking</Text>
          )}
        </Pressable>
        <Text style={styles.disclaimer}>
          Prototipe demo — verifikasi dokumen (NPWP, izin usaha) disimulasikan.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  multiline,
  ...input
}: {
  label: string;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor="#98a2b3"
        multiline={multiline}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  contentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  introText: { flex: 1, color: '#475467', fontSize: 13, lineHeight: 18 },
  card: { gap: 4 },
  field: { gap: 0 },
  label: { fontWeight: '700', color: '#0b1727', marginTop: 10, marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: '#f3f6fb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#0b1727',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f3f6fb',
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
    gap: 2,
  },
  typeActive: { borderColor: colors.primary, backgroundColor: '#eef4fd' },
  typeLabel: { fontWeight: '800', color: '#0b1727', fontSize: 14 },
  typeLabelActive: { color: colors.primary },
  typeHint: { color: '#98a2b3', fontSize: 11 },
  typeHintActive: { color: '#4a78c9' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceInput: { flex: 1, minWidth: 0 },
  priceDash: { color: '#98a2b3', fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontWeight: '700', color: '#0b1727', fontSize: 14 },
  switchSub: { color: '#667085', fontSize: 12 },
  homeFields: { flexDirection: 'row', gap: 12, marginTop: 4 },
  homeField: { flex: 1, minWidth: 0 },
  submit: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBusy: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disclaimer: { textAlign: 'center', color: '#98a2b3', fontSize: 11, marginTop: 4 },
});
