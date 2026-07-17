import type { NextConfig } from "next";

// The mobile apps use EXPO_PUBLIC_* while Next.js conventionally exposes only
// NEXT_PUBLIC_* to browser code. Accept either pair so the console can reuse
// the shared demo environment without duplicating or hard-coding credentials.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const nextConfig: NextConfig = {
  transpilePackages: ["@umotor/shared"],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
};

export default nextConfig;
