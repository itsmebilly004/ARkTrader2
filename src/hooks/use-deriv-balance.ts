// Reads balances from the Supabase accounts table.
// Seeds ROT90769691 (real) and DOT91870166 (demo) for new users automatically.
// Maintains identical LiveBalance / DerivAccount shape so all consumers compile.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DerivTokenSource, TradingAdapter } from "@/lib/deriv";
import type { DerivAccountPlacement, DerivAccountType } from "@/lib/deriv-account";

export type DerivAccount = {
  id?: string;
  account_id: string;
  loginid: string;
  type: DerivAccountType;
  normalizedType: DerivAccountType;
  label: string;
  currency: string | null;
  balance: number;
  deriv_token: string;
  is_demo: boolean;
  is_virtual: boolean;
  account_type: string | null;
  classification_reason: string;
  detected_prefix: string | null;
  final_tab_placement: DerivAccountPlacement;
  status?: string;
  expires_at?: string | null;
  created_at?: string | null;
  token_source?: DerivTokenSource;
  trading_authorized?: boolean | null;
  trading_adapter?: TradingAdapter | null;
  trading_authorized_at?: string | null;
  last_trading_error?: string | null;
};

export type LiveBalance = {
  account: DerivAccount | null;
  accounts: DerivAccount[];
  balance: number | null;
  currency: string;
  loading: boolean;
  refreshing: boolean;
  refreshBalances: (reason?: string, selectedAccountId?: string) => Promise<void>;
  switchAccount: (accountId: string) => void;
};

type DbAccount = {
  id: string;
  user_id: string;
  loginid: string;
  account_type: string;
  currency: string;
  balance: number;
  is_demo: boolean;
  is_virtual: boolean;
};

function dbToDerivAccount(row: DbAccount): DerivAccount {
  const isDemo = row.is_demo;
  return {
    id: row.id,
    account_id: row.loginid,
    loginid: row.loginid,
    type: isDemo ? "demo" : "real",
    normalizedType: isDemo ? "demo" : "real",
    label: isDemo ? "Demo Account" : "Real Account",
    currency: row.currency,
    balance: row.balance,
    deriv_token: "sim_token",
    is_demo: isDemo,
    is_virtual: row.is_virtual,
    account_type: row.account_type,
    classification_reason: "loginid-prefix",
    detected_prefix: isDemo ? "DOT" : "ROT",
    final_tab_placement: isDemo ? "demoAccounts" : "realAccounts",
    token_source: "oauth_access_token",
    trading_authorized: true,
    trading_adapter: "oauth2PkceTradingAdapter",
    trading_authorized_at: new Date().toISOString(),
    last_trading_error: null,
  };
}

async function seedAccounts(userId: string): Promise<void> {
  const seeds = [
    { loginid: "ROT90769691", account_type: "real", currency: "USD", balance: 10000, is_demo: false, is_virtual: false },
    { loginid: "DOT91870166", account_type: "demo", currency: "USD", balance: 10000, is_demo: true, is_virtual: true },
  ];
  for (const seed of seeds) {
    await supabase.from("accounts").upsert(
      { ...seed, user_id: userId },
      { onConflict: "user_id,loginid", ignoreDuplicates: true },
    );
  }
}

const SELECTED_KEY = (userId: string) => `selected_account:${userId}`;

export function useDerivBalance(): LiveBalance {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seededRef = useRef(false);

  const loadAccounts = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("is_demo");
    if (error || !data) return;
    const mapped = data.map((r) => dbToDerivAccount(r as DbAccount));
    setAccounts(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      setLoading(false);
      seededRef.current = false;
      return;
    }
    let cancelled = false;

    const init = async () => {
      if (!seededRef.current) {
        seededRef.current = true;
        await seedAccounts(user.id);
      }
      if (cancelled) return;
      const mapped = await loadAccounts(user.id);
      if (cancelled) return;
      setLoading(false);

      const saved = localStorage.getItem(SELECTED_KEY(user.id));
      const found = mapped?.find((a) => a.account_id === saved);
      if (found) {
        setSelectedId(found.account_id);
      } else if (mapped && mapped.length > 0) {
        const real = mapped.find((a) => !a.is_demo) ?? mapped[0];
        setSelectedId(real.account_id);
      }
    };
    void init();

    // Realtime subscription for live balance updates
    const channel = supabase
      .channel(`accounts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${user.id}` },
        () => { void loadAccounts(user.id); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user, loadAccounts]);

  const refreshBalances = useCallback(
    async (_reason?: string, _selectedAccountId?: string) => {
      if (!user) return;
      setRefreshing(true);
      await loadAccounts(user.id);
      setRefreshing(false);
    },
    [user, loadAccounts],
  );

  const switchAccount = useCallback(
    (accountId: string) => {
      setSelectedId(accountId);
      if (user) localStorage.setItem(SELECTED_KEY(user.id), accountId);
    },
    [user],
  );

  const account = accounts.find((a) => a.account_id === selectedId) ?? accounts[0] ?? null;

  return {
    account,
    accounts,
    balance: account?.balance ?? null,
    currency: account?.currency ?? "USD",
    loading,
    refreshing,
    refreshBalances,
    switchAccount,
  };
}
