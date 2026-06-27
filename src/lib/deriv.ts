// Simulation stub — all Deriv WebSocket/OAuth replaced with no-ops & simulated data.
// Keeps every export so dependent files compile unchanged.

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
export type TradingAdapter = "oauth2PkceTradingAdapter" | "legacyDirectTokenAdapter";
export type TradingWebSocketMode = "oauth-otp" | "legacy-authorize";
export type DerivTokenSource = "oauth_access_token" | "deriv_legacy_token";

export type DerivOAuthDiagnostics = Record<string, unknown>;
export type DerivOAuthRedirectFailure = {
  message: string;
  reason: "app-dashboard" | "home-dashboard";
  url: string;
};
export type DerivOAuthPkceBackup = {
  state: string;
  codeVerifier: string;
  attemptId: string;
  createdAt: string;
  expiresAt: string;
  redirectUri: string;
  clientId: string;
  authorizationUrl: string;
};

type DerivError = { code?: string; message?: string };
export type DerivMessage = Record<string, unknown> & {
  req_id?: number;
  msg_type?: string;
  error?: DerivError;
  subscription?: { id?: string };
  tick?: { symbol?: string; quote?: string | number; epoch?: string | number };
  balance?: { balance?: string | number; currency?: string; loginid?: string };
  proposal?: Record<string, unknown>;
  buy?: Record<string, unknown>;
  sell?: Record<string, unknown>;
  authorize?: Record<string, unknown>;
  proposal_open_contract?: Record<string, unknown> & { is_sold?: boolean };
  candles?: Array<{
    epoch?: string | number;
    open?: string | number;
    high?: string | number;
    low?: string | number;
    close?: string | number;
  }>;
  history?: { prices?: Array<string | number>; times?: Array<string | number> };
  active_symbols?: Array<{
    symbol?: string;
    display_name?: string;
    market?: string;
    market_display_name?: string;
    submarket?: string;
    submarket_display_name?: string;
  }>;
};

export type DerivBalance = { balance: number; currency: string; loginid: string };

export type ActiveSymbol = {
  symbol: string;
  display_name: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
};

export type TradingAuthorizationState = {
  account_id: string;
  trading_authorized: boolean;
  trading_adapter: TradingAdapter;
  token_source: DerivTokenSource;
  trading_authorized_at: string | null;
  last_trading_error: string | null;
};

export type DerivTradingSession = {
  account_id: string;
  sessionId: string | null;
  accountId: string;
  loginid: string;
  deriv_token: string;
  token: string;
  token_source: DerivTokenSource;
  tokenSource: DerivTokenSource;
  adapter: TradingAdapter;
  websocketMode: TradingWebSocketMode;
  expires_at: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  sessionAccountId: string;
  sessionLoginid: string | null;
  normalizedType: "real" | "demo" | "unknown";
  trading_authorized: boolean;
  trading_adapter: TradingAdapter;
  trading_authorized_at: string | null;
  last_trading_error: string | null;
};

export type TradeCategory =
  | "rise_fall"
  | "higher_lower"
  | "touch_no_touch"
  | "even_odd"
  | "over_under"
  | "matches_differs"
  | "accumulator"
  | "multiplier";

export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type TickPoint = { time: number; value: number };

// ─── Constants ───────────────────────────────────────────────────────────────

export const DERIV_TRADING_SESSION_NOT_INITIALIZED_MESSAGE = "Trading session not initialized";
export const DERIV_TRADING_AUTHORIZATION_NOT_READY_MESSAGE =
  "Account connected. Trading authorization not ready yet.";
export const DERIV_OAUTH_DASHBOARD_FAILURE_MESSAGE =
  "Deriv returned an account parameter instead of an OAuth authorization code. The connection cannot be completed. Please try connecting again.";

export const SYNTHETIC_MARKETS = [
  { symbol: "R_10", name: "Volatility 10 Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index" },
  { symbol: "BOOM500", name: "Boom 500 Index" },
  { symbol: "BOOM1000", name: "Boom 1000 Index" },
  { symbol: "CRASH500", name: "Crash 500 Index" },
  { symbol: "CRASH1000", name: "Crash 1000 Index" },
  { symbol: "stpRNG", name: "Step Index" },
  { symbol: "RDBEAR", name: "Bear Market Index" },
  { symbol: "RDBULL", name: "Bull Market Index" },
];

export const TRADE_CATEGORIES: { value: TradeCategory; label: string; description: string }[] = [
  { value: "rise_fall", label: "Rise / Fall", description: "Predict if the market goes up or down." },
  { value: "higher_lower", label: "Higher / Lower", description: "Predict vs. a barrier price." },
  { value: "touch_no_touch", label: "Touch / No Touch", description: "Will the price touch a barrier?" },
  { value: "even_odd", label: "Even / Odd", description: "Last digit of the exit spot is even or odd." },
  { value: "over_under", label: "Over / Under", description: "Last digit over/under a chosen number." },
  { value: "matches_differs", label: "Matches / Differs", description: "Last digit matches your prediction." },
  { value: "accumulator", label: "Accumulators", description: "Compound profit while price stays in range." },
  { value: "multiplier", label: "Multipliers", description: "Amplify profit and loss with a multiplier." },
];


// ─── Real Market Data via Public Deriv WebSocket ────────────────────────────────

const DERIV_APP_ID = 1089;
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

let sharedWs: WebSocket | null = null;
let wsReadyPromise: Promise<void> | null = null;
let wsReqId = 1;
const wsResolvers = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void; timeout: number }>();
const wsTickSubscribers = new Map<string, Set<(price: number, time: number) => void>>();
const wsTickStreamIds = new Map<string, string>(); // symbol -> subscription stream id

function getDerivWs(): Promise<WebSocket> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    return Promise.resolve(sharedWs);
  }

  if (wsReadyPromise) {
    return wsReadyPromise.then(() => sharedWs!);
  }

  wsReadyPromise = new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        sharedWs = ws;
        resolve();
      };
      ws.onerror = (err) => {
        if (!sharedWs) reject(err);
      };
      ws.onclose = () => {
        sharedWs = null;
        wsReadyPromise = null;
        wsTickStreamIds.clear();
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          
          if (data.msg_type === "tick" && data.tick) {
            const sym = data.tick.symbol;
            const subs = wsTickSubscribers.get(sym);
            if (subs) {
              const price = Number(data.tick.quote);
              const time = Number(data.tick.epoch);
              subs.forEach(cb => cb(price, time));
            }
          }
          
          if (data.req_id && wsResolvers.has(data.req_id)) {
            const { resolve, reject: rej, timeout } = wsResolvers.get(data.req_id)!;
            clearTimeout(timeout);
            wsResolvers.delete(data.req_id);
            if (data.error) {
              rej(new Error(data.error.message || "Deriv WS Error"));
            } else {
              resolve(data);
            }
          }
        } catch (e) {
          console.error("Deriv WS parse error:", e);
        }
      };
    } catch (err) {
      reject(err);
    }
  });
  
  return wsReadyPromise.then(() => sharedWs!);
}

async function sendWsRequest(payload: Record<string, any>, timeoutMs = 15000): Promise<any> {
  const ws = await getDerivWs();
  return new Promise((resolve, reject) => {
    const req_id = wsReqId++;
    const request = { ...payload, req_id };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timeout = window.setTimeout(() => {
      wsResolvers.delete(req_id);
      reject(new Error(`Deriv WS timeout for ${payload.ticks_history || payload.ticks || "request"}`));
    }, timeoutMs) as any;
    
    wsResolvers.set(req_id, { resolve, reject, timeout });
    ws.send(JSON.stringify(request));
  });
}

// ─── Connection status ────────────────────────────────────────────────────────

type StatusListener = (s: ConnectionStatus) => void;
const statusListeners = new Set<StatusListener>();

export function onStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn("connected");
  return () => statusListeners.delete(fn);
}

export function getStatus(): ConnectionStatus {
  return "connected";
}

// ─── Message bus (no-op for compatibility) ────────────────────────────────────

type Listener = (msg: DerivMessage) => void;
const messageListeners = new Set<Listener>();

export function onMessage(fn: Listener): () => void {
  messageListeners.add(fn);
  return () => messageListeners.delete(fn);
}

export async function send(_payload: Record<string, unknown>): Promise<DerivMessage> {
  return {};
}

export async function forgetSubscription(_id: string): Promise<void> {}

// ─── Account / session stubs ──────────────────────────────────────────────────

export function getTradingSocketAccountId(): string | null {
  return null;
}

export function getSelectedTradingAccountId(): string | null {
  return null;
}

export function setAuthenticatedAccount(
  _accessToken: string,
  _accountId: string,
  _isDemo?: boolean | null,
  _tokenSource?: DerivTokenSource,
): void {}

export function adapterForTokenSource(_source: DerivTokenSource): TradingAdapter {
  return "oauth2PkceTradingAdapter";
}

export function tradingWebSocketMode(_source: DerivTokenSource): TradingWebSocketMode {
  return "oauth-otp";
}

export function tradingAuthorizationIsFresh(_state: TradingAuthorizationState | null | undefined): boolean {
  return true;
}

export function readStoredTradingAuthorizationState(
  _userId: string,
  _accountId: string,
): TradingAuthorizationState | null {
  return null;
}

export function getDerivTradingErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Trade failed.";
}

export function isDerivTradingAuthorizationFailure(_error: unknown): boolean {
  return false;
}

function makeMockSession(accountId: string): DerivTradingSession {
  return {
    account_id: accountId,
    sessionId: null,
    accountId,
    loginid: accountId,
    deriv_token: "sim_token",
    token: "sim_token",
    token_source: "oauth_access_token",
    tokenSource: "oauth_access_token",
    adapter: "oauth2PkceTradingAdapter",
    websocketMode: "oauth-otp",
    expires_at: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    sessionAccountId: accountId,
    sessionLoginid: accountId,
    normalizedType: accountId.startsWith("DOT") ? "demo" : "real",
    trading_authorized: true,
    trading_adapter: "oauth2PkceTradingAdapter",
    trading_authorized_at: new Date().toISOString(),
    last_trading_error: null,
  };
}

export async function getActiveDerivTradingSession(
  selectedAccount?: { account_id?: string; loginid?: string } | null,
): Promise<DerivTradingSession> {
  const id = selectedAccount?.account_id ?? selectedAccount?.loginid ?? "ROT90769691";
  return makeMockSession(id);
}

export async function ensureDerivTradingConnection(
  account: { account_id?: string; loginid?: string } | null | undefined,
  _options?: { context?: string },
): Promise<DerivTradingSession> {
  const id = account?.account_id ?? account?.loginid ?? "ROT90769691";
  return makeMockSession(id);
}

export function disconnectAll(): void {}

// ─── OAuth stubs ──────────────────────────────────────────────────────────────

export function sanitizeDerivOAuthUrl(url: string): string {
  return url;
}

export function redirectToDerivOAuth(_url: string): void {}

export function redirectToDerivLegacyOAuth(_url: string): void {}

export async function buildOAuthUrl(_options?: { returnTo?: string }): Promise<string> {
  return "#";
}

export function buildLegacyOAuthUrl(_options?: { returnTo?: string }): string {
  return "#";
}

export function recordDerivOAuthTrace(_event: string, _details?: Record<string, unknown>): void {}

export function readDerivOAuthTrace(): unknown[] {
  return [];
}

export function getDerivOAuthRedirectFailure(): DerivOAuthRedirectFailure | null {
  return null;
}

export async function getDerivOAuthDiagnostics(): Promise<DerivOAuthDiagnostics> {
  return {};
}

export function ensureDerivOAuthCanonicalOrigin(_redirect?: string): void {}

// ─── Market data (Real WebSocket) ─────────────────────────────────────────────

export async function getActiveSymbols(): Promise<ActiveSymbol[]> {
  return SYNTHETIC_MARKETS.map((m) => ({
    symbol: m.symbol,
    display_name: m.name,
    market: "synthetic_index",
    market_display_name: "Synthetic Indices",
    submarket: "random_index",
    submarket_display_name: "Continuous Indices",
  }));
}

export async function fetchTicks(symbol: string, count = 500): Promise<TickPoint[]> {
  const res = await sendWsRequest({
    ticks_history: symbol,
    end: "latest",
    count: Math.min(count, 5000),
    style: "ticks",
  });
  
  if (!res.history || !res.history.prices || !res.history.times) return [];
  
  const ticks: TickPoint[] = [];
  for (let i = 0; i < res.history.prices.length; i++) {
    ticks.push({
      time: Number(res.history.times[i]),
      value: Number(res.history.prices[i]),
    });
  }
  return ticks;
}

export async function publicSendBatch(
  payloads: Array<Record<string, unknown>>,
  options?: { timeoutMs?: number },
): Promise<Array<DerivMessage | Error>> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  return Promise.all(
    payloads.map(async (payload, index): Promise<DerivMessage | Error> => {
      const reqId = Number(payload.req_id ?? index + 1);
      try {
        if (payload.ticks_history) {
          const symbol = String(payload.ticks_history);
          const count = Number(payload.count ?? 500);
          const ticks = await fetchTicks(symbol, count);
          return {
            req_id: reqId,
            msg_type: "history",
            history: {
              prices: ticks.map((t) => String(t.value)),
              times: ticks.map((t) => String(t.time)),
            },
          } as DerivMessage;
        }
        return { req_id: reqId };
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
    }),
  );
}

export async function fetchCandles(
  symbol: string,
  granularity: number,
  count = 500,
): Promise<Candle[]> {
  const res = await sendWsRequest({
    ticks_history: symbol,
    end: "latest",
    count: Math.min(count, 5000),
    style: "candles",
    granularity,
  });
  
  if (!res.candles) return [];
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.candles.map((c: any) => ({
    time: Number(c.epoch),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }));
}

export async function subscribeTicks(
  symbol: string,
  onTick: (price: number, time: number) => void,
): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  
  if (!wsTickSubscribers.has(symbol)) {
    wsTickSubscribers.set(symbol, new Set());
  }
  const subs = wsTickSubscribers.get(symbol)!;
  subs.add(onTick);
  
  if (subs.size === 1) {
    sendWsRequest({ ticks: symbol, subscribe: 1 }).then(res => {
      if (res.subscription) {
        wsTickStreamIds.set(symbol, res.subscription.id);
      }
    }).catch(console.error);
  }
  
  return () => {
    subs.delete(onTick);
    if (subs.size === 0) {
      const streamId = wsTickStreamIds.get(symbol);
      if (streamId) {
        sendWsRequest({ forget: streamId }).catch(() => {});
        wsTickStreamIds.delete(symbol);
      }
    }
  };
}


// ─── Trading helpers ──────────────────────────────────────────────────────────

export function contractTypeFor(category: TradeCategory, side: string): string {
  const map: Record<string, string> = {
    "rise_fall:up": "CALL",
    "rise_fall:down": "PUT",
    "higher_lower:higher": "CALL",
    "higher_lower:lower": "PUT",
    "touch_no_touch:touch": "ONETOUCH",
    "touch_no_touch:no_touch": "NOTOUCH",
    "even_odd:even": "DIGITEVEN",
    "even_odd:odd": "DIGITODD",
    "over_under:over": "DIGITOVER",
    "over_under:under": "DIGITUNDER",
    "matches_differs:matches": "DIGITMATCH",
    "matches_differs:differs": "DIGITDIFF",
    "accumulator:up": "ACCU",
    "accumulator:buy": "ACCU",
    "multiplier:up": "MULTUP",
    "multiplier:down": "MULTDOWN",
  };
  return map[`${category}:${side}`] ?? "CALL";
}
