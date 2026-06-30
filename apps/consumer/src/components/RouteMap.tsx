import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, type LatLng } from '@umotor/shared';

/**
 * Real interactive map: a Leaflet map over OpenStreetMap tiles, rendered inside
 * a WebView. Works in Expo Go (react-native-webview is a supported module) with
 * no API key and no native map module / dev client — unlike react-native-maps.
 *
 * The HTML is built once from the first non-empty `coords`; subsequent updates
 * (e.g. a live ride streaming points) are pushed via injectJavaScript so the map
 * never reloads. Start marker is green; the head is blue while live, red when
 * finished.
 */
function buildHtml(initial: LatLng[], live: boolean) {
  const coordsJson = JSON.stringify(initial.map((c) => [c.lat, c.lng]));
  const headColor = live ? '#0e4da4' : '#e0543f';
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #eef3fb; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([-6.914, 107.61], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    var line = L.polyline([], { color: '${'#0e4da4'}', weight: 5, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    var startMarker = null, headMarker = null;
    function render(coords) {
      if (!coords || !coords.length) return;
      line.setLatLngs(coords);
      var start = coords[0], head = coords[coords.length - 1];
      if (!startMarker) {
        startMarker = L.circleMarker(start, { radius: 6, color: '#fff', weight: 2, fillColor: '${'#00a86b'}', fillOpacity: 1 }).addTo(map);
      } else { startMarker.setLatLng(start); }
      if (!headMarker) {
        headMarker = L.circleMarker(head, { radius: 6, color: '#fff', weight: 2, fillColor: '${headColor}', fillOpacity: 1 }).addTo(map);
      } else { headMarker.setLatLng(head); }
      try {
        if (coords.length > 1) { map.fitBounds(line.getBounds(), { padding: [26, 26], maxZoom: 17 }); }
        else { map.setView(head, 16); }
      } catch (e) {}
    }
    render(${coordsJson});
    window.updateRoute = function (c) { render(c); };
    // RN postMessage bridge (Android fires on document, iOS on window).
    function onMsg(e) { try { render(JSON.parse(e.data)); } catch (err) {} }
    document.addEventListener('message', onMsg);
    window.addEventListener('message', onMsg);
  </script>
</body>
</html>`;
}

export function RouteMap({
  coords,
  height = 200,
  live = false,
  style,
}: {
  coords: LatLng[];
  height?: number;
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<WebView>(null);
  const hasRoute = coords.length > 0;

  // Build the HTML once, from the first coords we actually have. Until then we
  // show the empty placeholder; the WebView mounts with real data so the first
  // paint already has the route.
  const html = useMemo(() => (hasRoute ? buildHtml(coords, live) : null), [hasRoute]);

  // Stream later point updates into the already-loaded map (no reload).
  useEffect(() => {
    if (!hasRoute) return;
    const payload = JSON.stringify(coords.map((p) => [p.lat, p.lng]));
    ref.current?.injectJavaScript(`window.updateRoute && window.updateRoute(${payload}); true;`);
  }, [coords, hasRoute]);

  if (!html) {
    return (
      <View style={[styles.wrap, { height }, style]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Belum ada rute</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }, style]}>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        // The map is decorative within a scroll; keep gestures with the screen.
        style={[styles.webview, { pointerEvents: live ? 'none' : 'auto' }]}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        overScrollMode="never"
        startInLoadingState={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#eef3fb',
    borderWidth: 1,
    borderColor: '#e5e9f0',
  },
  webview: { flex: 1, backgroundColor: '#eef3fb' },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#98a2b3', fontSize: 13 },
});
