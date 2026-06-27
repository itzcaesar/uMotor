import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors } from '@umotor/shared';
import { useAstraPayBrowser } from '@/lib/astrapay-browser';

// AstraPay's push-payment success screen doesn't redirect back to us, so for
// payments we watch the page for its "Transaksi Berhasil" confirmation and
// auto-close — the status poll then confirms settlement. (Binding finishes via
// the redirect interception instead, so it doesn't use this.)
const SUCCESS_DETECT_JS = `
(function () {
  var sent = false;
  function check() {
    if (sent) return;
    var t = (document.body && document.body.innerText) || '';
    if (/Transaksi Berhasil|Pembayaran Berhasil/i.test(t)) {
      sent = true;
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage('astrapay:success');
    }
  }
  check();
  var iv = setInterval(check, 800);
  setTimeout(function () { clearInterval(iv); }, 120000);
})();
true;
`;

/**
 * In-app AstraPay WebView. Mounted once at the root; renders only while a
 * request is parked in the store (openAstraPayBrowser). The user completes the
 * AstraPay flow without ever leaving the app.
 *
 * It's a full-screen absolute View, NOT an RN <Modal>: react-native-webview text
 * inputs don't receive keyboard focus inside a Modal on Android (you can't type
 * the phone number). We intercept navigation to our finish URL (carries the
 * authCode on binding) and resolve. If the page can't embed, an error state
 * offers an external-browser fallback so the flow is never a dead end.
 */
export function AstraPayBrowserHost() {
  const request = useAstraPayBrowser((s) => s.request);
  const finish = useAstraPayBrowser((s) => s.finish);
  const [loading, setLoading] = useState(true);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Android hardware back closes the in-app browser (cancel) instead of
  // navigating the screen hidden underneath it.
  useEffect(() => {
    if (!request) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish({ type: 'cancel' });
      return true;
    });
    return () => sub.remove();
  }, [request, finish]);

  if (!request) return null;

  // The finish redirect lands on our custom-scheme URL (which the WebView can't
  // load anyway) — or any URL carrying the authCode. Intercept and resolve.
  const isFinish = (url: string) =>
    url.startsWith(request.finishUrl) ||
    url.startsWith('umotor://') ||
    url.includes('astrapay/bound') ||
    url.includes('astrapay/paid') ||
    /[?#&]authCode=/i.test(url);

  const close = (type: 'success' | 'cancel', url?: string) => {
    setLoading(true);
    setFirstLoaded(false);
    setFailed(false);
    finish({ type, url });
  };

  // Embedded blocked → finish via the system in-app browser (custom tab) instead.
  const openExternal = async () => {
    try {
      const r = await WebBrowser.openAuthSessionAsync(request.url, request.finishUrl);
      close(r.type === 'success' && r.url ? 'success' : 'cancel', r.type === 'success' ? r.url : undefined);
    } catch {
      close('cancel');
    }
  };

  return (
    <View style={styles.fill}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.dot}>
              <Ionicons name="wallet" size={14} color="#fff" />
            </View>
            <Text style={styles.title}>{request.title}</Text>
          </View>
          <Pressable
            onPress={() => close('cancel')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Tutup"
          >
            <Ionicons name="close" size={24} color="#0b1727" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {failed ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={40} color="#cbd5e1" />
              <Text style={styles.errTitle}>Halaman AstraPay gagal dimuat</Text>
              <Text style={styles.errSub}>Coba lagi, atau buka di peramban.</Text>
              <Pressable style={styles.btn} onPress={() => { setFailed(false); setLoading(true); setFirstLoaded(false); }}>
                <Text style={styles.btnText}>Coba lagi</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={openExternal}>
                <Text style={[styles.btnText, styles.btnGhostText]}>Buka di peramban</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <WebView
                key={request.url}
                source={{ uri: request.url }}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => {
                  setLoading(false);
                  setFirstLoaded(true);
                }}
                onError={() => setFailed(true)}
                onHttpError={() => setFailed(true)}
                onShouldStartLoadWithRequest={(req) => {
                  if (isFinish(req.url)) {
                    close('success', req.url);
                    return false;
                  }
                  return true;
                }}
                // Some redirects (302 to a custom scheme) only surface here.
                onNavigationStateChange={(nav: WebViewNavigation) => {
                  if (isFinish(nav.url)) close('success', nav.url);
                }}
                injectedJavaScript={request.detectSuccess ? SUCCESS_DETECT_JS : undefined}
                onMessage={(e) => {
                  if (e.nativeEvent.data === 'astrapay:success') close('success');
                }}
                javaScriptEnabled
                domStorageEnabled
                keyboardDisplayRequiresUserAction={false}
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                originWhitelist={['https://*', 'http://*', 'umotor://*', 'exp://*']}
              />
              {/* Only on the INITIAL load — never re-cover the page (would hide the
                  OTP screen when AstraPay does an in-page transition). */}
              {loading && !firstLoaded && (
                <View style={styles.loading} pointerEvents="none">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Memuat AstraPay…</Text>
                </View>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    zIndex: 9999,
    elevation: 30, // Android: stack above the navigator
  },
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e9f0',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '800', color: colors.primary, fontSize: 15 },
  body: { flex: 1 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
  },
  loadingText: { color: '#667085', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  errTitle: { fontWeight: '800', color: '#0b1727', fontSize: 16, marginTop: 4 },
  errSub: { color: '#667085', fontSize: 13, textAlign: 'center' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGhost: { backgroundColor: '#eef4fd' },
  btnGhostText: { color: colors.primary },
});
