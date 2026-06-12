import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@umotor/shared';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';

export default function Login() {
  const login = useSession((s) => s.login);
  const [busy, setBusy] = useState(false);

  const onLogin = () => {
    setBusy(true);
    setTimeout(() => {
      login();
      router.replace('/(tabs)');
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>uMotor</Text>
      <Text style={styles.mitra}>MITRA BENGKEL</Text>
      <Text style={styles.tagline}>Kelola booking, antrian, dan penjualan bengkel Anda.</Text>

      {!isConfigured && (
        <Text style={styles.envWarning}>
          Supabase belum dikonfigurasi — salin .env.example ke .env lalu restart Expo.
        </Text>
      )}

      <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={onLogin} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Masuk sebagai Mitra Bengkel</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>Demo: masuk sebagai AHASS Bandung Timur</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f3f6fb' },
  logo: { fontSize: 44, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  mitra: {
    textAlign: 'center',
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 2,
  },
  tagline: { marginTop: 12, fontSize: 15, color: '#667085', textAlign: 'center' },
  envWarning: {
    marginTop: 24,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fdf3e3',
    color: '#9a6700',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    marginTop: 40,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { textAlign: 'center', color: '#98a2b3', fontSize: 12, marginTop: 12 },
});
