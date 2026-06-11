// Reads balances from the Supabase accounts table.
// Account rows are created server-side by the `handle_new_user` trigger; this
// hook also calls ensureUserProvisioned as a client-side safety net.
// Maintains identical LiveBalance / DerivAccount shape so all consumers compile.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserProvisioned } from "@/lib/account-provisioning";
import { useAuthContext } from "@/context/auth-context";
import type { DerivTokenSource, TradingAdapter } from "@/lib/deriv";
import {
  booleanFrom,
  normalizeDerivAccount,
  stringFrom,
  type DerivAccountPlacement,
  type DerivAccountType,
} from "@/lib/deriv-account";

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

type DbAccount = Record<string, unknown> & {
  id?: string;
  user_id?: string;
  loginid?: string;
  account_id?: string;
  account_type?: string;
  currency?: string;
  balance?: number | string | null;
  is_demo?: boolean | string | number | null;
  is_virtual?: boolean | string | number | null;
};

function dbToDerivAccount(row: DbAccount): DerivAccount | null {
  const loginid = stringFrom(row.loginid, row.account_id, row.id);
  if (!loginid) return null;
  const normalized =
    normalizeDerivAccount({
      ...row,
      account_id: loginid,
      loginid,
    }) ?? null;
  const isDemo = normalized
    ? normalized.is_demo
    : (booleanFrom(row.is_demo) ?? String(row.account_type ?? "").toLowerCase() === "demo");

  return {
    id: stringFrom(row.id) || undefined,
    account_id: loginid,
    loginid,
    type: isDemo ? "demo" : "real",
    normalizedType: isDemo ? "demo" : "real",
    label: normalized?.label ?? (isDemo ? "Demo Account" : "Real Account"),
    currency: normalized?.currency ?? stringFrom(row.currency, "USD"),
    balance: Number(row.balance ?? 0),
    deriv_token: "sim_token",
    is_demo: isDemo,
    is_virtual: booleanFrom(row.is_virtual) ?? isDemo,
    account_type: stringFrom(row.account_type, isDemo ? "demo" : "real"),
    classification_reason: normalized?.classification_reason ?? "database-account-row",
    detected_prefix: normalized?.detected_prefix ?? (isDemo ? "DOT" : "ROT"),
    final_tab_placement: isDemo ? "demoAccounts" : "realAccounts",
    token_source: "oauth_access_token",
    trading_authorized: true,
    trading_adapter: "oauth2PkceTradingAdapter",
    trading_authorized_at: new Date().toISOString(),
    last_trading_error: null,
  };
}

const SELECTED_KEY = (userId: string) => `selected_account:${userId}`;

async function fetchAccountsFromApi(accessToken: string): Promise<DbAccount[] | null> {
  try {
    const response = await fetch("/api/deriv-accounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.error("[Balances] Account API failed", {
        status: response.status,
        body,
      });
      return null;
    }
    const body = (await response.json()) as { accounts?: DbAccount[] };
    return Array.isArray(body.accounts) ? body.accounts : [];
  } catch (error) {
    console.error("[Balances] Account API request failed", error);
    return null;
  }
}

export function useDerivBalance(): LiveBalance {
  const { user, session, loading: authLoading } = useAuthContext();
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seededRef = useRef(false);

  const loadAccounts = useCallback(async (userId: string, accessToken?: string) => {
    let rows: DbAccount[] | null = accessToken ? await fetchAccountsFromApi(accessToken) : null;

    if (!rows) {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", userId);
      if (error) {
        console.error("[Balances] Could not load accounts from database", error);
        setAccounts([]);
        return [];
      }
      rows = data as DbAccount[];
    }

    const mapped = (rows ?? [])
      .map((row) => dbToDerivAccount(row as DbAccount))
      .filter((account): account is DerivAccount => Boolean(account))
      .sort((a, b) => Number(a.is_demo) - Number(b.is_demo));
    setAccounts(mapped);
    return mapped;
  }, []);

  const loadProvisionedAccounts = useCallback(
    async (userId: string, email: string | null, accessToken?: string) => {
      let mapped = await loadAccounts(userId, accessToken);
      if (mapped && mapped.length > 0) return mapped;

      await ensureUserProvisioned(userId, email);
      mapped = await loadAccounts(userId, accessToken);
      if (!mapped || mapped.length === 0) {
        console.warn("[Balances] No account rows are visible for the signed-in user", {
          userId,
        });
      }
      return mapped;
    },
    [loadAccounts],
  );

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user || !session) {
      setAccounts([]);
      setLoading(false);
      seededRef.current = false;
      return;
    }
    let cancelled = false;

    const init = async () => {
      if (cancelled) return;
      const mapped = seededRef.current
        ? await loadAccounts(user.id, session.access_token)
        : await loadProvisionedAccounts(user.id, user.email ?? null, session.access_token);
      seededRef.current = true;
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
        () => {
          void loadAccounts(user.id, session.access_token);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authLoading, session, user, loadAccounts, loadProvisionedAccounts]);

  const refreshBalances = useCallback(
    async (_reason?: string, selectedAccountId?: string) => {
      if (!user) return;
      setRefreshing(true);
      const mapped = await loadProvisionedAccounts(
        user.id,
        user.email ?? null,
        session?.access_token,
      );
      if (
        selectedAccountId &&
        mapped?.some((account) => account.account_id === selectedAccountId)
      ) {
        setSelectedId(selectedAccountId);
        localStorage.setItem(SELECTED_KEY(user.id), selectedAccountId);
      }
      setRefreshing(false);
    },
    [session?.access_token, user, loadProvisionedAccounts],
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
