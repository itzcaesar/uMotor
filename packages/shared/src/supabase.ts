import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client factory — each app passes its own env values
 * (EXPO_PUBLIC_* or NEXT_PUBLIC_*).
 */
export function createSupabase(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false }, // fake login, no real auth
  });
}
