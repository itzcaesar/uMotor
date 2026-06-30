import { StyleSheet, Text, View } from 'react-native';
import { Redirect, useRootNavigationState } from 'expo-router';
import { umotor } from '@/components/ui';
import { useSession } from '@/lib/session';

/** Figma "Loading Page" — branded splash shown until the navigator resolves. */
function LoadingSplash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.logo}>uMotor</Text>
      <Text style={styles.tagline}>Satu Ekosistem Semua Kebutuhan Motor</Text>
      <Text style={styles.footer}>Apex Capital, uMotor 2026.</Text>
    </View>
  );
}

export default function Index() {
  const userId = useSession((s) => s.userId);
  const navState = useRootNavigationState();

  // Wait until the root navigator has mounted before redirecting. Redirecting on
  // the first frame races expo-router's initial-URL resolution and triggers a
  // "state update on a component that hasn't mounted yet" warning.
  if (!navState?.key) return <LoadingSplash />;

  return <Redirect href={userId ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: umotor.bg },
  logo: { fontSize: 64, fontWeight: '800', color: umotor.primary, letterSpacing: -1 },
  tagline: { fontSize: 14, fontWeight: '500', color: '#a6a6a6', marginTop: 6 },
  footer: { position: 'absolute', bottom: 48, fontSize: 13, fontWeight: '500', color: umotor.faint },
});
