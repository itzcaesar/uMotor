import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

export default function Index() {
  const workshopId = useSession((s) => s.workshopId);
  return <Redirect href={workshopId ? '/(tabs)' : '/login'} />;
}
