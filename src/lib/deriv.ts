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

// ─── Price simulation ─────────────────────────────────────────────────────────

const BASE_PRICES: Record<string, number> = {
  R_10: 600, R_25: 1800, R_50: 3200, R_75: 5300, R_100: 8500,
  "1HZ10V": 620, "1HZ25V": 1850, "1HZ50V": 3250, "1HZ75V": 5400, "1HZ100V": 8600,
  BOOM500: 4200, BOOM1000: 9800, CRASH500: 4100, CRASH1000: 9600,
  stpRNG: 100, RDBEAR: 2100, RDBULL: 2900,
};

const VOLATILITIES: Record<string, number> = {
  R_10: 0.0002, R_25: 0.0004, R_50: 0.0006, R_75: 0.0008, R_100: 0.001,
  "1HZ10V": 0.0003, "1HZ25V": 0.0005, "1HZ50V": 0.0007, "1HZ75V": 0.0009, "1HZ100V": 0.0012,
  BOOM500: 0.0008, BOOM1000: 0.001, CRASH500: 0.0008, CRASH1000: 0.001,
  stpRNG: 0.0001, RDBEAR: 0.0006, RDBULL: 0.0006,
};

const priceState = new Map<string, number>();

function currentPrice(symbol: string): number {
  if (!priceState.has(symbol)) priceState.set(symbol, BASE_PRICES[symbol] ?? 1000);
  return priceState.get(symbol)!;
}

function nextPrice(symbol: string): number {
  const vol = VOLATILITIES[symbol] ?? 0.0005;
  const prev = currentPrice(symbol);
  const change = prev * vol * (Math.random() * 2 - 1);
  const next = Math.max(prev + change, 0.001);
  priceState.set(symbol, next);
  return next;
}

function decimals(symbol: string): number {
  return symbol === "stpRNG" ? 2 : 4;
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

// ─── Market data (simulated) ──────────────────────────────────────────────────

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
  const now = Math.floor(Date.now() / 1000);
  let price = BASE_PRICES[symbol] ?? 1000;
  const vol = VOLATILITIES[symbol] ?? 0.0005;
  const ticks: TickPoint[] = [];
  for (let i = count; i >= 0; i--) {
    price = Math.max(price * (1 + vol * (Math.random() * 2 - 1)), 0.001);
    ticks.push({ time: now - i, value: parseFloat(price.toFixed(decimals(symbol))) });
  }
  priceState.set(symbol, price);
  return ticks;
}

export async function fetchCandles(
  symbol: string,
  granularity: number,
  count = 500,
): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  let price = BASE_PRICES[symbol] ?? 1000;
  const vol = VOLATILITIES[symbol] ?? 0.0005;
  const candles: Candle[] = [];
  for (let i = count; i >= 0; i--) {
    const open = price;
    const moves = Array.from({ length: 4 }, () => price * (1 + vol * (Math.random() * 2 - 1)));
    const high = Math.max(open, ...moves);
    const low = Math.min(open, ...moves);
    const close = moves[moves.length - 1];
    price = Math.max(close, 0.001);
    candles.push({
      time: now - i * granularity,
      open: parseFloat(open.toFixed(decimals(symbol))),
      high: parseFloat(high.toFixed(decimals(symbol))),
      low: parseFloat(low.toFixed(decimals(symbol))),
      close: parseFloat(close.toFixed(decimals(symbol))),
    });
  }
  priceState.set(symbol, price);
  return candles;
}

export async function subscribeTicks(
  symbol: string,
  onTick: (price: number, time: number) => void,
): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  let active = true;
  const tick = () => {
    if (!active) return;
    const price = nextPrice(symbol);
    onTick(parseFloat(price.toFixed(decimals(symbol))), Math.floor(Date.now() / 1000));
  };
  tick();
  const id = window.setInterval(tick, 1000);
  return () => {
    active = false;
    window.clearInterval(id);
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
    "multiplier:up": "MULTUP",
    "multiplier:down": "MULTDOWN",
  };
  return map[`${category}:${side}`] ?? "CALL";
}
