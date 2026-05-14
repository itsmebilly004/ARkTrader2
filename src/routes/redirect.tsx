import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDerivAccount } from "@/lib/deriv-account";
import { derivCredentials } from "@/lib/deriv-credentials";
import { DERIV_LEGACY_APP_ID, DERIV_LEGACY_WEBSOCKET_URL } from "@/lib/deriv-config";
import {
  adapterForTokenSource,
  recordDerivOAuthTrace,
  tradingWebSocketMode,
  type DerivTokenSource,
} from "@/lib/deriv";

// Legacy direct-token Deriv OAuth callback. The redirect URL Deriv sends users
// back to (https://www.arktradershub.com/redirect) carries token1/acct1/cur1
// triplets — one per linked account. We authorize each over the public Deriv
// WebSocket (no PKCE / no token exchange) and persist the results.

export const Route = createFileRoute("/redirect")({
  component: LegacyRedirectCallback,
});

type LegacyAccountTriplet = {
  index: number;
  loginid: string;
  token: string;
  currency: string;
};

type AuthorizeResult = {
  loginid: string;
  email?: string;
  currency: string;
  balance: number;
  is_virtual: boolean;
  account_type?: string;
};

const LEGACY_PROCESSING_KEY = "deriv_legacy_callback_processing";
const LEGACY_REDIRECTING_KEY = "deriv_legacy_oauth_redirecting";
const LEGACY_FAILURE_KEY = "deriv_legacy_callback_failed";
const TOKEN_SOURCE: DerivTokenSource = "deriv_legacy_token";
const TRADING_ADAPTER = adapterForTokenSource(TOKEN_SOURCE);
const WEBSOCKET_MODE = tradingWebSocketMode(TOKEN_SOURCE);
let legacyCallbackInFlight = false;

function activeAccountStorageKey(userId: string) {
  return `deriv_active_account:${userId}`;
}
function selectedAccountIdStorageKey(userId: string) {
  return `selected_deriv_account_id:${userId}`;
}
function selectedAccountTypeStorageKey(userId: string) {
  return `selected_deriv_account_type:${userId}`;
}
function selectedTokenSourceStorageKey(userId: string) {
  return `selected_deriv_token_source:${userId}`;
}
function selectedAdapterStorageKey(userId: string) {
  return `selected_deriv_adapter:${userId}`;
}
function tokenSourceStorageKey(userId: string, accountId: string) {
  return `deriv_token_source:${userId}:${accountId.toUpperCase()}`;
}
function tradingAdapterStorageKey(userId: string, accountId: string) {
  return `deriv_trading_adapter:${userId}:${accountId.toUpperCase()}`;
}

function parseLegacyTriplets(search: URLSearchParams): LegacyAccountTriplet[] {
  const triplets: LegacyAccountTriplet[] = [];
  for (let index = 1; index < 32; index++) {
    const acct = search.get(`acct${index}`);
    const token = search.get(`token${index}`);
    const cur = search.get(`cur${index}`);
    if (!acct || !token) continue;
    triplets.push({
      index,
      loginid: acct.trim(),
      token: token.trim(),
      currency: (cur ?? "").trim(),
    });
  }
  return triplets;
}

async function authorizeOnce(
  ws: WebSocket,
  token: string,
  loginid: string,
): Promise<AuthorizeResult> {
  return new Promise((resolve, reject) => {
    const reqId = Math.floor(Math.random() * 1_000_000_000);
    const timeout = window.setTimeout(() => {
      ws.removeEventListener("message", listener);
      reject(new Error(`Deriv authorize timed out for ${loginid}.`));
    }, 15_000);
    const listener = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.req_id !== reqId) return;
        ws.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        if (parsed.error) {
          reject(new Error(parsed.error.message ?? `Deriv refused to authorize ${loginid}.`));
          return;
        }
        const authorize = parsed.authorize ?? {};
        resolve({
          loginid: String(authorize.loginid ?? loginid),
          email: authorize.email ? String(authorize.email) : undefined,
          currency: String(authorize.currency ?? ""),
          balance: Number(authorize.balance ?? 0),
          is_virtual:
            authorize.is_virtual === 1 ||
            authorize.is_virtual === true ||
            String(authorize.is_virtual ?? "").toLowerCase() === "true",
          account_type: authorize.account_type ? String(authorize.account_type) : undefined,
        });
      } catch (error) {
        ws.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error("Could not parse Deriv response."));
      }
    };
    ws.addEventListener("message", listener);
    try {
      ws.send(JSON.stringify({ authorize: token, req_id: reqId }));
    } catch (error) {
      ws.removeEventListener("message", listener);
      window.clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error("Could not send authorize payload."));
    }
  });
}

async function openLegacyAuthorizationSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `${DERIV_LEGACY_WEBSOCKET_URL}?app_id=${encodeURIComponent(DERIV_LEGACY_APP_ID)}`;
    const ws = new WebSocket(url);
    const timeout = window.setTimeout(() => {
      try {
        ws.close(1000, "Legacy socket open timed out");
      } catch {
        /* ignore */
      }
      reject(new Error("Deriv legacy WebSocket did not open in time."));
    }, 10_000);
    ws.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeout);
        resolve(ws);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("Deriv legacy WebSocket connection failed."));
      },
      { once: true },
    );
  });
}

async function ensureSupabaseSession(primaryAccountId: string) {
  const { email, password } = await derivCredentials(primaryAccountId);
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError && signIn.user) return signIn.user;
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: primaryAccountId, deriv_account_id: primaryAccountId } },
  });
  if (signUpError) throw signUpError;
  if (!signUp.session) {
    const { data: retry, error: retryError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (retryError) throw retryError;
    return retry.user!;
  }
  return signUp.user!;
}

function LegacyRedirectCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Connecting your Deriv account...");
  const [stage, setStage] = useState("legacy-callback-started");
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const triplets = parseLegacyTriplets(params);
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    recordDerivOAuthTrace("legacy-oauth-callback-arrived", {
      href: window.location.href,
      origin: window.location.origin,
      searchKeys: Array.from(params.keys()),
      tripletCount: triplets.length,
      hasError: Boolean(error),
    });

    if (legacyCallbackInFlight) {
      setStatus("Deriv legacy authorization is already being processed...");
      return;
    }
    legacyCallbackInFlight = true;
    sessionStorage.setItem(LEGACY_PROCESSING_KEY, "true");
    sessionStorage.removeItem(LEGACY_REDIRECTING_KEY);
    sessionStorage.removeItem(LEGACY_FAILURE_KEY);

    const markStage = (next: string, details: Record<string, unknown> = {}) => {
      setStage(next);
      console.info(`[Deriv Legacy Callback] ${next}`, details);
    };

    (async () => {
      try {
        if (error) {
          throw new Error(
            errorDescription ? `${error}: ${errorDescription}` : `Authorization failed: ${error}`,
          );
        }
        if (!triplets.length) {
          throw new Error(
            "No legacy Deriv tokens were returned. Please restart the legacy connect flow.",
          );
        }
        markStage("legacy callback parsed", {
          tripletCount: triplets.length,
          loginids: triplets.map((triplet) => triplet.loginid),
        });

        setStatus("Verifying Deriv legacy tokens...");
        markStage("legacy authorize socket opening", {
          app_id: DERIV_LEGACY_APP_ID,
        });
        const ws = await openLegacyAuthorizationSocket();
        const authorized: Array<{
          triplet: LegacyAccountTriplet;
          result: AuthorizeResult;
        }> = [];
        try {
          for (const triplet of triplets) {
            markStage("legacy authorize started", {
              loginid: triplet.loginid,
              index: triplet.index,
            });
            const result = await authorizeOnce(ws, triplet.token, triplet.loginid);
            authorized.push({ triplet, result });
            markStage("legacy authorize success", {
              loginid: result.loginid,
              currency: result.currency,
              is_virtual: result.is_virtual,
            });
          }
        } finally {
          try {
            ws.close(1000, "Legacy authorize complete");
          } catch {
            /* ignore */
          }
        }

        const normalizedAccounts = authorized
          .map(({ triplet, result }) =>
            normalizeDerivAccount(
              {
                loginid: result.loginid || triplet.loginid,
                account_id: result.loginid || triplet.loginid,
                currency: result.currency || triplet.currency,
                balance: result.balance,
                deriv_token: triplet.token,
                is_demo: result.is_virtual,
                is_virtual: result.is_virtual,
                account_type: result.account_type ?? null,
              },
              { trustVirtualFlags: true },
            ),
          )
          .filter((account): account is NonNullable<ReturnType<typeof normalizeDerivAccount>> =>
            Boolean(account),
          )
          .filter((account) => account.normalizedType !== "unknown");
        if (!normalizedAccounts.length) {
          throw new Error("No usable Deriv accounts were returned by the legacy authorize step.");
        }
        const primary =
          normalizedAccounts.find((account) => account.normalizedType === "real") ??
          normalizedAccounts[0];
        const primaryAccountId = String(primary.loginid ?? primary.account_id);

        setStatus("Creating your ArkTrader session...");
        markStage("supabase session creation started", { primaryAccountId });
        const sessionUser = await ensureSupabaseSession(primaryAccountId);

        const connectedAt = new Date().toISOString();
        markStage("supabase upserts started", {
          accountCount: normalizedAccounts.length,
          token_source: TOKEN_SOURCE,
          trading_adapter: TRADING_ADAPTER,
        });
        for (const account of normalizedAccounts) {
          const accountId = String(account.loginid ?? account.account_id);
          const accountToken = String(account.deriv_token ?? "");
          if (!accountToken) {
            throw new Error(`Missing Deriv token for ${accountId}.`);
          }
          localStorage.setItem(tokenSourceStorageKey(sessionUser.id, accountId), TOKEN_SOURCE);
          localStorage.setItem(
            tradingAdapterStorageKey(sessionUser.id, accountId),
            TRADING_ADAPTER,
          );
          const { data: savedSession, error: upsertError } = await supabase
            .from("sessions")
            .upsert(
              {
                user_id: sessionUser.id,
                account_id: accountId,
                loginid: accountId,
                deriv_token: accountToken,
                currency: account.currency ?? (account.normalizedType === "demo" ? "USD" : ""),
                balance: Number(account.balance ?? 0),
                is_demo: account.normalizedType === "demo",
                is_virtual: account.normalizedType === "demo",
                is_active: true,
                expires_at: null,
                created_at: connectedAt,
                token_source: TOKEN_SOURCE,
                trading_adapter: TRADING_ADAPTER,
                trading_authorized: true,
                trading_authorized_at: connectedAt,
                last_trading_error: null,
              },
              { onConflict: "user_id,account_id" },
            )
            .select("id, account_id")
            .maybeSingle();
          if (upsertError) {
            throw new Error(
              `Could not save legacy Deriv session for ${accountId}: ${upsertError.message}`,
            );
          }
          if (savedSession?.id) {
            await supabase
              .from("sessions")
              .update({ is_active: false })
              .eq("user_id", sessionUser.id)
              .eq("account_id", accountId)
              .neq("id", savedSession.id);
          }
        }
        markStage("supabase upserts success", {
          accountIds: normalizedAccounts.map((account) => account.loginid ?? account.account_id),
        });

        const selectedAccountId = primaryAccountId;
        localStorage.setItem(activeAccountStorageKey(sessionUser.id), selectedAccountId);
        localStorage.setItem(selectedAccountIdStorageKey(sessionUser.id), selectedAccountId);
        localStorage.setItem(selectedAccountTypeStorageKey(sessionUser.id), primary.normalizedType);
        localStorage.setItem(selectedTokenSourceStorageKey(sessionUser.id), TOKEN_SOURCE);
        localStorage.setItem(selectedAdapterStorageKey(sessionUser.id), TRADING_ADAPTER);
        localStorage.setItem(
          tokenSourceStorageKey(sessionUser.id, selectedAccountId),
          TOKEN_SOURCE,
        );
        localStorage.setItem(
          tradingAdapterStorageKey(sessionUser.id, selectedAccountId),
          TRADING_ADAPTER,
        );
        sessionStorage.removeItem(LEGACY_PROCESSING_KEY);
        sessionStorage.removeItem(LEGACY_REDIRECTING_KEY);

        window.dispatchEvent(
          new CustomEvent("deriv:sessions-updated", {
            detail: {
              userId: sessionUser.id,
              selectedAccountId,
              accountCount: normalizedAccounts.length,
              tokenSource: TOKEN_SOURCE,
              adapter: TRADING_ADAPTER,
              websocketMode: WEBSOCKET_MODE,
              trading_authorized: true,
              trading_authorized_at: connectedAt,
            },
          }),
        );
        toast.success(
          `Welcome - ${normalizedAccounts.length} Deriv account${normalizedAccounts.length > 1 ? "s" : ""} linked.`,
        );
        legacyCallbackInFlight = false;
        const returnTo = sessionStorage.getItem("deriv_legacy_oauth_return_to") || "/dashboard";
        sessionStorage.removeItem("deriv_legacy_oauth_return_to");
        window.location.replace(returnTo.startsWith("/") ? returnTo : "/dashboard");
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : "Authorization failed";
        console.error("[Deriv Legacy Callback] failed", { message, error: caught });
        recordDerivOAuthTrace("legacy-oauth-callback-failed", { message });
        legacyCallbackInFlight = false;
        sessionStorage.removeItem(LEGACY_PROCESSING_KEY);
        sessionStorage.removeItem(LEGACY_REDIRECTING_KEY);
        sessionStorage.setItem(LEGACY_FAILURE_KEY, message);
        setFailed(true);
        setErrorMessage(message);
        setStatus(message);
        toast.error(message);
      }
    })();
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="glass-card w-[min(calc(100vw-2rem),34rem)] rounded-xl p-6">
        <div className="flex items-center gap-3">
          {failed ? (
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
          ) : (
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium">{status}</div>
            <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
              {stage}
            </div>
          </div>
        </div>
        {failed && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <div>{errorMessage ?? "Deriv legacy login could not be completed."}</div>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
              className="mt-3 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
