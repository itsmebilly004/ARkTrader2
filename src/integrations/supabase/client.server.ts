// src/integrations/supabase/client.server.ts
import "../../polyfill";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function cleanEnv(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
  const SERVICE_KEY =
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    cleanEnv(process.env.SUPABASE_SECRET_KEY) ||
    cleanEnv(process.env.SUPABASE_SERVICE_KEY) ||
    cleanEnv(process.env.SERVICE_ROLE_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) ||
    cleanEnv(process.env.VITE_SUPABASE_SECRET_KEY);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("[Supabase Admin] Environment variables missing. Check Vercel settings.");
    return null;
  }

  return createClient<Database, "public">(SUPABASE_URL, SERVICE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type SupabaseAdminClient = SupabaseClient<Database, "public">;

let _supabaseAdmin: SupabaseAdminClient | null = null;

// The Proxy prevents a crash if the client is imported but keys are missing
export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_, prop) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    if (!_supabaseAdmin) {
      return () => {
        throw new Error("Supabase Admin keys missing in Vercel environment.");
      };
    }
    return (_supabaseAdmin as unknown as Record<PropertyKey, unknown>)[prop];
  },
});
