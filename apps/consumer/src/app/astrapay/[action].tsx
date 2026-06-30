import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@umotor/shared';
import { useAstraPayBrowser } from '@/lib/astrapay-browser';

/**
 * AstraPay webview return landing (astrapay/paid, astrapay/bound).
 *
 * Normally the in-app WebView intercepts the finish redirect itself and this
 * route is never reached. But if the OS delivers the deep link instead (some
 * Android configs) while a flow is awaiting, we resolve that pending request
 * here so it doesn't hang — handing back the authCode so binding still links.
 * With no pending request (web / cold start) it just bounces into the app.
 */
export default function AstraPayReturn() {
  const { action, authCode, auth_code, code } = useLocalSearchParams<{
    action: string;
    authCode?: string;
    auth_code?: string;
    code?: string;
  }>();

  useEffect(() => {
    const pending = useAstraPayBrowser.getState().request;
    if (pending) {
      const c = authCode ?? auth_code ?? code;
      useAstraPayBrowser.getState().finish(
        c
          ? { type: 'success', url: `umotor://astrapay/${action}?authCode=${encodeURIComponent(String(c))}` }
          : { type: 'cancel' },
      );
      return; // the awaiting flow drives navigation itself
    }
    const t = setTimeout(() => {
      router.replace(action === 'bound' ? '/(tabs)/profile' : '/(tabs)/finance');
    }, 400);
    return () => clearTimeout(t);
  }, [action, authCode, auth_code, code]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={'#0e4da4'} />
      <Text style={styles.text}>Kembali ke aplikasi…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f3f6fb' },
  text: { color: '#667085', fontSize: 14 },
});
