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
    detectSessionInUrl: true,
  },
});
