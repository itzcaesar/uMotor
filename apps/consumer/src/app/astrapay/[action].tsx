import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@umotor/shared';

/**
 * AstraPay webview return landing (astrapay/paid, astrapay/bound).
 *
 * On native the in-app auth session captures the finish redirect itself and
 * resolves before this route is ever hit — so this is the web/cold-start safety
 * net: it just bounces back into the app instead of 404-ing on the deep link.
 */
export default function AstraPayReturn() {
  const { action } = useLocalSearchParams<{ action: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(action === 'bound' ? '/(tabs)/profile' : '/(tabs)/finance');
    }, 400);
    return () => clearTimeout(t);
  }, [action]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Kembali ke aplikasi…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f3f6fb' },
  text: { color: '#667085', fontSize: 14 },
});
