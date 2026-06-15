import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@umotor/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/**
 * QR check-in (PRD 02 §4.5). Camera scan is the show-off path; "Simulasi scan"
 * is the rehearsed fallback — stage lighting makes live scanning risky.
 */
export default function Scan() {
  // `token` arrives when opened from a booking detail (enables simulate).
  const { token } = useLocalSearchParams<{ token?: string }>();
  const workshopId = useSession((s) => s.workshopId);
  const qc = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<'scanning' | 'busy' | 'ok' | 'error'>('scanning');
  const [message, setMessage] = useState('Arahkan kamera ke QR booking pelanggan');
  const handled = useRef(false);
  const insets = useSafeAreaInsets();

  // Prompt for camera access on open so the scanner is live immediately.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const checkIn = async (qr: string) => {
    if (handled.current || !workshopId) return;
    handled.current = true;
    setState('busy');
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('qr_token', qr)
      .eq('workshop_id', workshopId)
      .limit(1);
    const booking = bookings?.[0];
    if (error || !booking) {
      setState('error');
      setMessage('QR tidak dikenal untuk bengkel ini.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => {
        handled.current = false;
        setState('scanning');
        setMessage('Arahkan kamera ke QR booking pelanggan');
      }, 1800);
      return;
    }
    if (booking.status !== 'confirmed') {
      setState('error');
      setMessage(
        booking.status === 'pending'
          ? 'Booking belum dikonfirmasi — terima dulu di Inbox.'
          : 'Booking sudah check-in / selesai.',
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => {
        handled.current = false;
        setState('scanning');
        setMessage('Arahkan kamera ke QR booking pelanggan');
      }, 1800);
      return;
    }
    const { error: rpcErr } = await supabase.rpc('update_booking_status', {
      p_booking_id: booking.id,
      p_status: 'checked_in',
    });
    if (rpcErr) {
      setState('error');
      setMessage(rpcErr.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => {
        handled.current = false;
        setState('scanning');
        setMessage('Arahkan kamera ke QR booking pelanggan');
      }, 1800);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setState('ok');
    setMessage('Check-in berhasil!');
    qc.invalidateQueries();
    // Guard the back-stack: a direct/deep-link entry (or web refresh) has nothing
    // to pop, which throws "GO_BACK not handled" — fall back to the queue.
    setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/queue');
    }, 1200);
  };

  return (
    <View style={styles.screen}>
      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={state === 'scanning' ? ({ data }) => checkIn(data) : undefined}
        />
      ) : (
        <View style={styles.noPermission}>
          <Ionicons name="camera-outline" size={48} color="#98a2b3" />
          <Text style={styles.noPermText}>Butuh izin kamera untuk scan QR.</Text>
          <Pressable style={styles.permBtn} onPress={requestPermission} hitSlop={8}>
            <Text style={styles.permBtnText}>Izinkan kamera</Text>
          </Pressable>
        </View>
      )}

      {/* status overlay */}
      <View
        style={[
          styles.status,
          { top: insets.top + 8 },
          state === 'ok' && styles.statusOk,
          state === 'error' && styles.statusErr,
        ]}
      >
        <Ionicons
          name={state === 'ok' ? 'checkmark-circle' : state === 'error' ? 'alert-circle' : 'qr-code'}
          size={20}
          color="#fff"
        />
        <Text style={styles.statusText}>{message}</Text>
      </View>

      {token && state !== 'busy' && state !== 'ok' && (
        <Pressable
          style={[styles.simulate, { bottom: insets.bottom + 16 }]}
          onPress={() => {
            handled.current = false; // allow re-tap after an error reset
            checkIn(token);
          }}
        >
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.simulateText}>Simulasi scan</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1727' },
  camera: { flex: 1 },
  noPermission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  noPermText: { color: '#98a2b3', textAlign: 'center' },
  permBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  permBtnText: { color: '#fff', fontWeight: '700' },
  status: {
    position: 'absolute',
    top: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(11,23,39,0.85)',
    borderRadius: 12,
    padding: 14,
    // Sit above the native camera surface (Android draws it on top otherwise).
    zIndex: 20,
    elevation: 12,
  },
  statusOk: { backgroundColor: colors.accent },
  statusErr: { backgroundColor: colors.danger },
  statusText: { color: '#fff', fontWeight: '600', flexShrink: 1, fontSize: 13 },
  simulate: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    // Must sit above the camera surface or Android won't deliver the tap.
    zIndex: 20,
    elevation: 12,
  },
  simulateText: { color: colors.primary, fontWeight: '800' },
});
