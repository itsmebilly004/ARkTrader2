// src/integrations/supabase/client.ts
import "../../polyfill";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

const isBrowser = typeof window !== "undefined";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase browser environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient<Database, "public">(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: isBrowser ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    // Deriv OAuth also returns ?code=...&state=..., which Supabase can mistake for
    // its own OAuth callback and clear the app session. Supabase auth here uses
    // generated email/password credentials, so URL callback detection must stay off.
    detectSessionInUrl: false,
  },
});
