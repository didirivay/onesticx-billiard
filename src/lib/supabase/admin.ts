import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function isAdminSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && serviceKey);
}

/**
 * Klien Supabase khusus server-side (API Route / Server Component)
 * menggunakan SUPABASE_SERVICE_ROLE_KEY untuk operasi kasir & validasi PIN.
 * JANGAN pernah diimpor di Client Component.
 */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum diatur di .env.local. Salin Secret / service_role key dari Supabase Dashboard -> Project Settings -> API Keys.",
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
