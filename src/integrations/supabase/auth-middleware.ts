// src/integrations/supabase/auth-middleware.ts
import "../../polyfill";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "./types";

type SupabaseAuthContext = {
  supabase: ReturnType<typeof createClient<Database, "public">> | null;
  userId: string | null;
  claims: User | null;
};

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("[Supabase Middleware] URL or Key missing in Vercel.");
      const context: SupabaseAuthContext = {
        supabase: null,
        userId: null,
        claims: null,
      };
      return next({ context });
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient<Database, "public">(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      throw new Response("Invalid Session", { status: 401 });
    }

    const context: SupabaseAuthContext = {
      supabase,
      userId: data.user.id,
      claims: data.user,
    };

    return next({ context });
  },
);
