import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, samsatLookup, type VehicleInfo } from '@umotor/shared';
import { Card, tabletContainer, useResponsive } from '@/components/ui';
import { safeBack } from '@/lib/nav';
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
  const [looking, setLooking] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const r = useResponsive();

  const lookup = async () => {
    if (!plate.trim() || looking) return;
    // "Samsat API" demo moment: vehicle data pulled from a plate (PRD 01 §4.2).
    setLooking(true);
    setChecked(false);
    setFound(null);
    try {
      const info = await samsatLookup(plate);
      setFound(info);
      setChecked(true);
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    if (!userId || !found || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { data: bike, error } = await supabase
        .from('motorcycles')
        .insert({
          user_id: userId,
          plate: found.plate,
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
      // Inline confirmation — Alert is a no-op on web, so we show success in-screen.
      setSaved(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Coba lagi.';
      setErrorMsg(
        msg.includes('duplicate key') ? 'Plat ini sudah terdaftar di garasi.' : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <View style={styles.screen}>
        <View style={[styles.content, tabletContainer(r)]}>
          <Card style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={52} color={colors.accent} />
            <Text style={styles.successTitle}>Motor terdaftar</Text>
            <Text style={styles.successBody}>
              {found?.brand} {found?.model} ({found?.plate}) sudah masuk ke garasimu.
            </Text>
            <Pressable style={styles.successBtn} onPress={() => safeBack('/(tabs)')}>
              <Ionicons name="bicycle" size={18} color="#fff" />
              <Text style={styles.successBtnText}>Lihat garasi</Text>
            </Pressable>
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, tabletContainer(r)]}>
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
            <Pressable
              style={[styles.lookupBtn, looking && styles.lookupBtnBusy]}
              onPress={lookup}
              disabled={looking}
            >
              {looking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.lookupText}>Cek Samsat</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Data kendaraan ditarik otomatis dari Samsat. Coba plat apa saja (mis. D 1234 ABC) — data
            kepemilikan & pajak muncul otomatis.
          </Text>
        </Card>

        {looking && (
          <Card style={styles.notFound}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.lookingText}>Menghubungi Samsat…</Text>
          </Card>
        )}

        {checked && !found && (
          <Card style={styles.notFound}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.notFoundText}>Format plat tidak valid. Contoh: D 1234 ABC.</Text>
          </Card>
        )}

        {found && (
          <Card style={styles.foundCard}>
            <View style={styles.foundHeader}>
              <Ionicons
                name={found.source === 'samsat' ? 'shield-checkmark' : 'cloud-outline'}
                size={20}
                color={found.source === 'samsat' ? colors.accent : colors.warning}
              />
              <Text style={styles.foundTitle}>
                {found.source === 'samsat' ? 'Terverifikasi Samsat' : 'Estimasi data kendaraan'}
              </Text>
              <View
                style={[styles.sourceBadge, found.source === 'estimated' && styles.sourceBadgeEst]}
              >
                <Text
                  style={[styles.sourceText, found.source === 'estimated' && styles.sourceTextEst]}
                >
                  {found.source === 'samsat' ? 'Samsat' : 'Estimasi'}
                </Text>
              </View>
            </View>
            <Text style={styles.foundModel}>
              {found.brand} {found.model} · {found.year} · {found.engine_cc}cc
            </Text>
            <View style={styles.foundMeta}>
              <FoundRow icon="location-outline" label="Wilayah" value={found.region} />
              <FoundRow icon="color-palette-outline" label="Warna" value={found.color} />
              <FoundRow icon="person-outline" label="Pemilik" value={found.owner_name} />
              <FoundRow
                icon="calendar-outline"
                label="Pajak (PKB)"
                value={`Jatuh tempo ${new Date(found.tax_due).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`}
              />
              <FoundRow icon="card-outline" label="STNK berlaku s/d" value={found.stnk_valid_until.slice(0, 4)} />
            </View>
            <Text style={styles.label}>Odometer saat ini (km)</Text>
            <TextInput
              style={styles.input}
              value={odometer}
              onChangeText={setOdometer}
              placeholder="12000"
              keyboardType="number-pad"
              placeholderTextColor="#98a2b3"
            />
            {errorMsg && (
              <View style={styles.errRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errText}>{errorMsg}</Text>
              </View>
            )}
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

function FoundRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.foundRow}>
      <Ionicons name={icon} size={15} color="#667085" />
      <Text style={styles.foundRowLabel}>{label}</Text>
      <Text style={styles.foundRowValue}>{value}</Text>
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
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupBtnBusy: { opacity: 0.7 },
  lookupText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: { color: '#98a2b3', fontSize: 11, marginTop: 8, lineHeight: 15 },
  notFound: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notFoundText: { color: colors.danger, fontWeight: '600', flexShrink: 1 },
  lookingText: { color: colors.primary, fontWeight: '600' },
  foundCard: { gap: 8 },
  foundHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foundTitle: { fontWeight: '800', color: '#0b1727', flex: 1 },
  sourceBadge: {
    backgroundColor: '#e2f6ee',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 150,
  },
  sourceBadgeEst: { backgroundColor: '#fdf3e3' },
  sourceText: { color: '#067647', fontSize: 11, fontWeight: '700' },
  sourceTextEst: { color: '#9a6700' },
  foundModel: { color: '#344054', fontWeight: '700', fontSize: 15 },
  foundMeta: {
    gap: 6,
    marginBottom: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foundRowLabel: { color: '#667085', fontSize: 12, width: 110 },
  foundRowValue: { color: '#0b1727', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  saveBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBusy: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  errText: { color: colors.danger, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  successCard: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  successTitle: { fontSize: 19, fontWeight: '800', color: '#0b1727', marginTop: 4 },
  successBody: { color: '#475467', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  successBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
