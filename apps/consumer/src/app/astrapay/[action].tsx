import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAstraPayBrowser } from '@/lib/astrapay-browser';
import { resumeAstraPayWebBinding } from '@/lib/astrapay';
import { useSession } from '@/lib/session';

/**
 * AstraPay webview return landing (astrapay/paid, astrapay/bound).
 *
 * Normally the in-app WebView intercepts the finish redirect itself and this
 * route is never reached. But if the OS delivers the deep link instead (some
 * Android configs) while a flow is awaiting, we resolve that pending request
 * here so it doesn't hang — handing back the authCode so binding still links.
 * On web, a short-lived sessionStorage payload resumes the same-tab login after
 * the original document was unloaded. With no pending request it shows a clear
 * route back to login.
 */
export default function AstraPayReturn() {
  const [error, setError] = useState<string | null>(null);
  const { action, authCode, auth_code, code } = useLocalSearchParams<{
    action: string;
    authCode?: string;
    auth_code?: string;
    code?: string;
  }>();

  useEffect(() => {
    if (Platform.OS === 'web' && action === 'bound') {
      let cancelled = false;
      resumeAstraPayWebBinding(window.location.href)
        .then(({ walletBound, completed }) => {
          if (cancelled) return;
          if (!walletBound && !completed) {
            setError('Sesi login AstraPay tidak ditemukan. Silakan mulai lagi.');
            return;
          }
          useSession.getState().login();
          router.replace('/(tabs)');
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Login AstraPay gagal diselesaikan.');
          }
        });
      return () => {
        cancelled = true;
      };
    }

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
      {error ? (
        <>
          <Text style={styles.errorTitle}>Login belum selesai</Text>
          <Text style={styles.text}>{error}</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>Kembali ke login</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={'#0e4da4'} />
          <Text style={styles.text}>Menyelesaikan login AstraPay…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f3f6fb' },
  errorTitle: { color: '#0b1727', fontSize: 18, fontWeight: '800' },
  text: { maxWidth: 320, color: '#667085', fontSize: 14, textAlign: 'center' },
  button: { marginTop: 8, borderRadius: 12, backgroundColor: '#0e4da4', paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
