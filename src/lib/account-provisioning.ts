// Self-healing fallback for account provisioning.
// The Supabase `handle_new_user` trigger is the source of truth, but this
// helper guarantees a user always lands in a state where they have:
//   - a public.users profile row
//   - a real (paper) account with USD 10,000 starting balance
//   - a demo account with USD 10,000 starting balance
// It is safe to call repeatedly thanks to ON CONFLICT / SELECT-then-INSERT.

import { supabase } from "@/integrations/supabase/client";

const STARTING_BALANCE = 10000;

function loginidsFor(userId: string): { real: string; demo: string } {
  const hex = userId.replace(/-/g, "");
  return {
    real: `ROT${hex.slice(0, 8).toUpperCase()}`,
    demo: `DOT${hex.slice(8, 16).toUpperCase()}`,
  };
}

export async function ensureUserProvisioned(
  userId: string,
  email: string | null,
): Promise<void> {
  // Profile row
  await supabase
    .from("users")
    .upsert({ id: userId, email: email ?? null }, { onConflict: "id" });

  // Starter accounts
  const { data: existing, error } = await supabase
    .from("accounts")
    .select("id, is_demo")
    .eq("user_id", userId);
  if (error) return;

  const hasReal = existing?.some((a) => a.is_demo === false) ?? false;
  const hasDemo = existing?.some((a) => a.is_demo === true) ?? false;
  if (hasReal && hasDemo) return;

  const { real, demo } = loginidsFor(userId);
  const rows: Array<{
    user_id: string;
    loginid: string;
    account_type: string;
    currency: string;
    balance: number;
    is_demo: boolean;
    is_virtual: boolean;
  }> = [];

  if (!hasReal) {
    rows.push({
      user_id: userId,
      loginid: real,
      account_type: "real",
      currency: "USD",
      balance: STARTING_BALANCE,
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
      balance: STARTING_BALANCE,
      is_demo: true,
      is_virtual: true,
    });
  }
  if (rows.length === 0) return;

  await supabase
    .from("accounts")
    .upsert(rows, { onConflict: "user_id,loginid", ignoreDuplicates: true });
}
