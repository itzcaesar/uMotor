import { Redirect, useRootNavigationState } from 'expo-router';
import { useSession } from '@/lib/session';

export default function Index() {
  const userId = useSession((s) => s.userId);
  const navState = useRootNavigationState();

  // Wait until the root navigator has mounted before redirecting. Redirecting on
  // the first frame races expo-router's initial-URL resolution and triggers a
  // "state update on a component that hasn't mounted yet" warning.
  if (!navState?.key) return null;

  return <Redirect href={userId ? '/(tabs)' : '/login'} />;
}
