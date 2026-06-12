import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

export default function Index() {
  const userId = useSession((s) => s.userId);
  return <Redirect href={userId ? '/(tabs)' : '/login'} />;
}
