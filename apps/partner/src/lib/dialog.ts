import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs. react-native-web does NOT implement Alert.alert — on
 * web it's a silent no-op, so any action gated behind a confirm button's
 * onPress (e.g. "Selesaikan servis", "Tolak booking", logout) never runs. These
 * helpers fall back to window.confirm / window.alert on web and use the native
 * Alert on device, so every button works in Expo Go and in a browser.
 */

type ConfirmOpts = { confirmLabel?: string; cancelLabel?: string; destructive?: boolean };

export function confirmDialog(
  title: string,
  message: string,
  onConfirm: () => void,
  opts: ConfirmOpts = {},
) {
  const { confirmLabel = 'Lanjut', cancelLabel = 'Batal', destructive = false } = opts;
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' ? window.confirm(message ? `${title}\n\n${message}` : title) : true;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function notify(title: string, message?: string, onDismiss?: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined);
}
