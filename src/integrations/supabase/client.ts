// src/integrations/supabase/client.ts
import "../../polyfill";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function cleanEnv(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function firstEnv(...values: unknown[]) {
  return values.map(cleanEnv).find(Boolean) ?? "";
}

const SUPABASE_URL = firstEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_KEY = firstEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

const isBrowser = typeof window !== "undefined";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase browser environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.",
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
