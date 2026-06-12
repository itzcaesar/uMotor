import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, samsatLookup, type VehicleInfo } from '@umotor/shared';
import { Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Default intervals applied to a freshly registered bike (architecture doc §8).
const DEFAULT_COMPONENTS = [
  { type: 'oil', interval_km: 3000 },
  { type: 'tire', interval_km: 20000 },
  { type: 'battery', interval_km: 15000 },
  { type: 'brake_pad', interval_km: 12000 },
  { type: 'air_filter', interval_km: 16000 },
];

export default function AddBike() {
  const userId = useSession((s) => s.userId);
  const qc = useQueryClient();
  const [plate, setPlate] = useState('');
  const [found, setFound] = useState<VehicleInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = () => {
    // "Samsat API" demo moment: instant vehicle data from a plate (PRD 01 §4.2).
    const info = samsatLookup(plate);
    setFound(info);
    setChecked(true);
  };

  const save = async () => {
    if (!userId || !found || busy) return;
    setBusy(true);
    try {
      const { data: bike, error } = await supabase
        .from('motorcycles')
        .insert({
          user_id: userId,
          plate: plate.trim().toUpperCase(),
          brand: found.brand,
          model: found.model,
          year: found.year,
          odometer_km: Number(odometer) || 0,
        })
        .select()
        .single();
      if (error) throw error;
      const odo = Number(odometer) || 0;
      await supabase.from('components').insert(
        DEFAULT_COMPONENTS.map((c) => ({
          motorcycle_id: bike.id,
          type: c.type,
          interval_km: c.interval_km,
          last_service_km: odo, // fresh registration assumes components serviced "now"
        })),
      );
      qc.invalidateQueries({ queryKey: ['garage'] });
      Alert.alert('Motor terdaftar', `${found.brand} ${found.model} masuk ke garasimu.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Gagal', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Card>
          <Text style={styles.label}>Plat nomor</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={plate}
              onChangeText={(t) => {
                setPlate(t);
                setChecked(false);
                setFound(null);
              }}
              placeholder="D 1234 ABC"
              autoCapitalize="characters"
              placeholderTextColor="#98a2b3"
            />
            <Pressable style={styles.lookupBtn} onPress={lookup}>
              <Text style={styles.lookupText}>Cek Samsat</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Data kendaraan ditarik otomatis dari Samsat. Demo: coba D 1234 ABC, B 5678 DEF, atau D
            9012 GHI.
          </Text>
        </Card>

        {checked && !found && (
          <Card style={styles.notFound}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.notFoundText}>Plat tidak ditemukan di Samsat.</Text>
          </Card>
        )}

        {found && (
          <Card style={styles.foundCard}>
            <View style={styles.foundHeader}>
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              <Text style={styles.foundTitle}>Data Samsat ditemukan</Text>
            </View>
            <Text style={styles.foundModel}>
              {found.brand} {found.model} · {found.year} · {found.engine_cc}cc
            </Text>
            <Text style={styles.label}>Odometer saat ini (km)</Text>
            <TextInput
              style={styles.input}
              value={odometer}
              onChangeText={setOdometer}
              placeholder="12000"
              keyboardType="number-pad"
              placeholderTextColor="#98a2b3"
            />
            <Pressable style={[styles.saveBtn, busy && styles.saveBusy]} onPress={save} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Daftarkan motor</Text>
              )}
            </Pressable>
          </Card>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6fb' },
  content: { padding: 16, gap: 12 },
  label: { fontWeight: '700', color: '#0b1727', marginBottom: 6, fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
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
  lookupBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  lookupText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: { color: '#98a2b3', fontSize: 11, marginTop: 8, lineHeight: 15 },
  notFound: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notFoundText: { color: colors.danger, fontWeight: '600' },
  foundCard: { gap: 8 },
  foundHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foundTitle: { fontWeight: '800', color: '#0b1727' },
  foundModel: { color: '#344054', fontWeight: '600', marginBottom: 6 },
  saveBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBusy: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
