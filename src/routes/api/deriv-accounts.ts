import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];

function env(...names: string[]) {
  for (const name of names) {
    const value = String(process.env[name] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return "";
}

function loginidsFor(userId: string): { real: string; demo: string } {
  const hex = userId.replace(/-/g, "");
  return {
    real: `ROT${hex.slice(0, 8).toUpperCase()}`,
    demo: `DOT${hex.slice(8, 16).toUpperCase()}`,
  };
}

async function ensureServerAccounts(
  client: ReturnType<typeof createClient<Database, "public">>,
  userId: string,
  existing: AccountRow[],
) {
  const hasReal = existing.some((account) => account.is_demo === false);
  const hasDemo = existing.some((account) => account.is_demo === true);
  if (hasReal && hasDemo) return;

  const { real, demo } = loginidsFor(userId);
  const rows: Database["public"]["Tables"]["accounts"]["Insert"][] = [];

  if (!hasReal) {
    rows.push({
      user_id: userId,
      loginid: real,
      account_type: "real",
      currency: "USD",
      balance: 0,
      is_demo: false,
      is_virtual: false,
    });
  }

  if (!hasDemo) {
    rows.push({
      user_id: userId,
      loginid: demo,
      account_type: "demo",
      currency: "USD",
      balance: 0,
      is_demo: true,
      is_virtual: true,
    });
  }

  if (!rows.length) return;

  const { error } = await client.from("accounts").upsert(rows, {
    onConflict: "user_id,loginid",
    ignoreDuplicates: true,
  });

  if (error) {
    console.error("[Accounts API] Could not provision account rows", error);
  }
}

export const Route = createFileRoute("/api/deriv-accounts")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";

        if (!token) {
          return Response.json({ error: "Missing Supabase session token" }, { status: 401 });
        }

        const supabaseUrl = env("SUPABASE_URL", "VITE_SUPABASE_URL");
        const publishableKey = env(
          "SUPABASE_ANON_KEY",
          "VITE_SUPABASE_ANON_KEY",
          "SUPABASE_PUBLISHABLE_KEY",
          "VITE_SUPABASE_PUBLISHABLE_KEY",
        );
        const serviceRoleKey = env(
          "SUPABASE_SERVICE_ROLE_KEY",
          "SUPABASE_SECRET_KEY",
          "SUPABASE_SERVICE_KEY",
          "SERVICE_ROLE_KEY",
          "VITE_SUPABASE_SERVICE_ROLE_KEY",
          "VITE_SUPABASE_SECRET_KEY",
        );

        if (!supabaseUrl || !publishableKey) {
          return Response.json(
            { error: "Supabase server environment is missing" },
            { status: 500 },
          );
        }

        const authClient = createClient<Database, "public">(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: authData, error: authError } = await authClient.auth.getUser(token);

        if (authError || !authData.user) {
          return Response.json({ error: "Invalid Supabase session" }, { status: 401 });
        }

        const userId = authData.user.id;
        const dbClient = createClient<Database, "public">(
          supabaseUrl,
          serviceRoleKey || publishableKey,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: serviceRoleKey ? undefined : { headers: { Authorization: `Bearer ${token}` } },
          },
        );

        let { data, error } = await dbClient.from("accounts").select("*").eq("user_id", userId);

        if (error) {
          console.error("[Accounts API] Could not read account rows", error);
          return Response.json(
            { error: "Could not load account rows", details: error.message },
            { status: 500 },
          );
        }

        if (serviceRoleKey) {
          await ensureServerAccounts(dbClient, userId, data ?? []);
          const refreshed = await dbClient.from("accounts").select("*").eq("user_id", userId);
          data = refreshed.data;
          error = refreshed.error;
        }

        if (error) {
          console.error("[Accounts API] Could not reload account rows", error);
          return Response.json(
            { error: "Could not reload account rows", details: error.message },
            { status: 500 },
          );
        }

        return Response.json({
          accounts: data ?? [],
          source: serviceRoleKey ? "service-role" : "user-session",
          userId,
        });
      },
      POST: async () =>
        Response.json({ error: "Use GET for simulation accounts" }, { status: 405 }),
    },
  },
});
