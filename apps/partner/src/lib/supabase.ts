import 'react-native-url-polyfill/auto';
import { createSupabase } from '@umotor/shared';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && key);
export const supabase = createSupabase(url || 'http://localhost', key || 'anon');
