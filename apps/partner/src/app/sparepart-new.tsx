import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { formatRp } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, colors, useResponsive } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Categories must match the consumer marketplace mapping (CATEGORY_LABELS / NEEDS).
const CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'oil', label: 'Oli', icon: 'water' },
  { key: 'filter', label: 'Filter', icon: 'filter' },
  { key: 'battery', label: 'Aki', icon: 'battery-charging' },
  { key: 'brake', label: 'Rem', icon: 'disc' },
  { key: 'tire', label: 'Ban', icon: 'ellipse' },
  { key: 'accessory', label: 'Aksesoris', icon: 'sparkles' },
];

// Common models so a new listing can be flagged "cocok untuk motormu" in the
// consumer app (the seeded demo bikes are Vario 160 + NMAX 155).
const MODELS = [
  'Vario 160',
  'NMAX 155',
  'Aerox 155',
  'PCX 160',
  'BeAT',
  'Scoopy',
  'Vario 125',
  'Mio M3',
];

export default function SparepartNew() {
  const workshopId = useSession((s) => s.workshopId);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('oil');
  const [price, setPrice] = useState('');
  const [installFee, setInstallFee] = useState('15000');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const r = useResponsive();

  const toggleModel = (m: string) =>
    setModels((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const submit = async () => {
    if (busy) return;
    if (!name.trim() || !price.trim()) {
      Alert.alert('Lengkapi data', 'Nama produk dan harga wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from('spareparts').insert({
        name: name.trim(),
        brand: brand.trim() || null,
        category,
        price: Number(price) || 0,
        install_fee: Number(installFee) || 0,
        workshop_id: workshopId,
        compatible_models: models,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['catalog'] });
      Alert.alert('Produk terbit', `${name.trim()} kini dijual di marketplace uMotor.`);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/orders');
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
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
          <Ionicons name="pricetag" size={20} color={colors.accent} />
          <Text style={styles.introText}>
            Tambah sparepart ke etalase. Pembeli bisa pesan kirim atau "pasang di bengkel" (pemasangan
            jadi pesanan masuk).
          </Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.label}>Nama produk</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Oli Federal Matic 0.8L"
            placeholderTextColor="#98a2b3"
          />
          <Text style={styles.label}>Merek (opsional)</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="Federal / AHM / Aspira"
            placeholderTextColor="#98a2b3"
          />

          <Text style={styles.label}>Kategori</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  style={[styles.cat, active && styles.catActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Ionicons name={c.icon} size={16} color={active ? '#fff' : colors.accent} />
                  <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <Text style={styles.label}>Harga (Rp)</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
                placeholder="65000"
                placeholderTextColor="#98a2b3"
              />
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.label}>Biaya pasang (Rp)</Text>
              <TextInput
                style={styles.input}
                value={installFee}
                onChangeText={setInstallFee}
                keyboardType="number-pad"
                placeholder="15000"
                placeholderTextColor="#98a2b3"
              />
            </View>
          </View>
          <Text style={styles.hint}>
            Biaya pasang ditambahkan jika pembeli memilih "Pasang di bengkel".
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Cocok untuk model</Text>
          <Text style={styles.hint}>Pilih model agar muncul sebagai rekomendasi untuk pemilik motor itu.</Text>
          <View style={styles.modelGrid}>
            {MODELS.map((m) => {
              const active = models.includes(m);
              return (
                <Pressable
                  key={m}
                  style={[styles.model, active && styles.modelActive]}
                  onPress={() => toggleModel(m)}
                >
                  {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                  <Text style={[styles.modelText, active && styles.modelTextActive]}>{m}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Pressable style={[styles.submit, busy && styles.submitBusy]} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              Terbitkan{price ? ` · ${formatRp(Number(price) || 0)}` : ''}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  contentWide: { maxWidth: 600, width: '100%', alignSelf: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  introText: { flex: 1, color: '#475467', fontSize: 13, lineHeight: 18 },
  card: { gap: 4 },
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
  hint: { color: '#98a2b3', fontSize: 11, marginTop: 4, lineHeight: 15 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f3f6fb',
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
  },
  catActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catText: { color: '#475467', fontWeight: '700', fontSize: 13 },
  catTextActive: { color: '#fff' },
  priceRow: { flexDirection: 'row', gap: 12 },
  priceCol: { flex: 1 },
  modelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  model: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f6fb',
    borderWidth: 1.5,
    borderColor: '#e5e9f0',
  },
  modelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modelText: { color: '#475467', fontWeight: '600', fontSize: 13 },
  modelTextActive: { color: '#fff' },
  submit: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBusy: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
