import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Workshop } from '@umotor/shared';

const isWeb = Platform.OS === 'web';

/**
 * Nearest-workshops map: Leaflet over OpenStreetMap tiles inside a WebView — same
 * approach as <RouteMap> (works in Expo Go, no API key, no native map module).
 *
 * One pin per workshop (AHASS = navy, others = mid-blue), bounds auto-fit to the
 * set. Tapping a pin posts its id back so the screen can open that workshop
 * (native; on web the list below is the reliable entry). `selectedId` re-centers
 * + opens that pin's popup via injectJavaScript without reloading the map.
 */
const BANDUNG = { lat: -6.9147, lng: 107.6098 };

function buildHtml(workshops: Workshop[]): string {
  const pins = workshops
    .filter((w) => w.lat != null && w.lng != null)
    .map((w) => ({
      id: w.id,
      lat: Number(w.lat),
      lng: Number(w.lng),
      name: w.name,
      dist: w.distance_km,
      ahass: w.type === 'ahass',
    }));
  const center = pins[0] ?? BANDUNG;
  const dataJson = JSON.stringify(pins);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #eef3fb; }
    .leaflet-control-attribution { font-size: 9px; }
    .pin { width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
           border: 2px solid #fff; box-shadow: 0 2px 5px rgba(11,23,39,0.35); }
    .pin.ahass { background: #0e2e5c; } .pin.indie { background: #2b6fd0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${center.lat}, ${center.lng}], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    var data = ${dataJson};
    var markers = {}, bounds = [];
    function post(id){ try { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(id); } else if (window.parent) { window.parent.postMessage({ __umotorWorkshop: id }, '*'); } } catch(e){} }
    data.forEach(function (w) {
      var icon = L.divIcon({ className: '', html: '<div class="pin ' + (w.ahass ? 'ahass' : 'indie') + '"></div>',
                             iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -22] });
      var m = L.marker([w.lat, w.lng], { icon: icon }).addTo(map);
      m.bindPopup('<b>' + w.name + '</b><br>' + (w.dist != null ? w.dist + ' km' : ''));
      m.on('click', function () { post(w.id); });
      markers[w.id] = m;
      bounds.push([w.lat, w.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else if (bounds.length > 1) { try { map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 }); } catch (e) {} }
    window.focusWorkshop = function (id) {
      var m = markers[id]; if (!m) return;
      map.setView(m.getLatLng(), 15, { animate: true }); m.openPopup();
    };
    window.addEventListener('message', function (e) {
      try { if (e.data && e.data.__umotorFocus) window.focusWorkshop(e.data.__umotorFocus); } catch (err) {}
    });
  </script>
</body>
</html>`;
}

export function WorkshopMap({
  workshops,
  selectedId,
  height = 280,
  onSelect,
  style,
}: {
  workshops: Workshop[];
  selectedId?: string | null;
  height?: number;
  onSelect?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  // Build the HTML once the workshop set is known; later selection changes are
  // pushed in (no reload) so the map keeps its pins + state.
  const html = useMemo(() => buildHtml(workshops), [workshops]);
  const nativeRef = useRef<WebView>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Native: list-tap → recenter + open that pin's popup, without reloading the map.
  useEffect(() => {
    if (isWeb || !selectedId) return;
    nativeRef.current?.injectJavaScript(`window.focusWorkshop && window.focusWorkshop(${JSON.stringify(selectedId)}); true;`);
  }, [selectedId]);

  // Web: list-tap → focus the matching pin inside the <iframe> via postMessage.
  useEffect(() => {
    if (!isWeb || !selectedId) return;
    frameRef.current?.contentWindow?.postMessage({ __umotorFocus: selectedId }, '*');
  }, [selectedId]);

  // Web: a pin tapped inside the <iframe> posts its id up — bubble it to onSelect.
  useEffect(() => {
    if (!isWeb) return;
    const onMsg = (e: MessageEvent) => {
      const id = (e.data as { __umotorWorkshop?: string })?.__umotorWorkshop;
      if (id) onSelect?.(id);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onSelect]);

  // react-native-webview renders a "not supported on this platform" stub on web,
  // so there we render the same Leaflet document inside an <iframe> instead.
  if (isWeb) {
    return (
      <View style={[styles.wrap, { height }, style]}>
        <iframe
          ref={frameRef}
          title="Peta bengkel terdekat"
          srcDoc={html}
          style={{ border: '0', display: 'block', width: '100%', height: '100%', backgroundColor: '#eef3fb' }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }, style]}>
      <WebView
        ref={nativeRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        onMessage={(e) => {
          const id = e.nativeEvent.data;
          if (id) {
            onSelect?.(id);
            nativeRef.current?.injectJavaScript(`window.focusWorkshop && window.focusWorkshop(${JSON.stringify(id)}); true;`);
          }
        }}
        scrollEnabled={false}
        startInLoadingState={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#eef3fb', borderWidth: 1, borderColor: '#e5e9f0' },
  webview: { flex: 1, backgroundColor: '#eef3fb' },
});
