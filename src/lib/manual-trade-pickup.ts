import type { TradeCategory } from "@/lib/deriv";

const PICKUP_KEY = "arktrader:manual-trade-pickup";

export type ManualTradePickup = {
  /** Market symbol the AI selected (or the user pinned) to trade. */
  symbol: string;
  /** Contract family to trade. */
  tradeType: TradeCategory;
  /** Opening stake. */
  stake: number;
  /** Session take-profit (absolute amount, 0 = none). */
  takeProfit: number;
  /** Session stop-loss (absolute amount, 0 = none). */
  stopLoss: number;
  /** Multiplicative martingale factor for digit / rise-fall loops (1 = flat). */
  martingale: number;
  /** Accumulator growth rate percent (e.g. 3 = 3%). Only used for accumulator. */
  growthRate: number;
  /** Purchase direction the AI recommended (even/odd/over/under/matches/differs/up/down/buy). */
  side: string;
  /** Prediction digit for over_under / matches_differs. */
  selectedDigit: number;
  /** When true, the manual trader auto-executes the configured loop on arrival. */
  autoRun: boolean;
};

const DEFAULTS: Omit<ManualTradePickup, "symbol" | "tradeType"> = {
  stake: 1,
  takeProfit: 0,
  stopLoss: 0,
  martingale: 1,
  growthRate: 3,
  side: "buy",
  selectedDigit: 5,
  autoRun: false,
};

export function setManualTradePickup(pickup: Partial<ManualTradePickup> & {
  symbol: string;
  tradeType: TradeCategory;
}): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PICKUP_KEY, JSON.stringify({ ...DEFAULTS, ...pickup }));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function consumeManualTradePickup(): ManualTradePickup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PICKUP_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PICKUP_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const symbol = typeof parsed.symbol === "string" && parsed.symbol ? parsed.symbol : null;
    const tradeType =
      typeof parsed.tradeType === "string" && parsed.tradeType ? parsed.tradeType : null;
    const stake = typeof parsed.stake === "number" && parsed.stake > 0 ? parsed.stake : null;
    if (!symbol || !tradeType || !stake) return null;
    return {
      symbol,
      tradeType: tradeType as TradeCategory,
      stake,
      takeProfit: numberOr(parsed.takeProfit, DEFAULTS.takeProfit),
      stopLoss: numberOr(parsed.stopLoss, DEFAULTS.stopLoss),
      martingale: numberOr(parsed.martingale, DEFAULTS.martingale),
      growthRate: numberOr(parsed.growthRate, DEFAULTS.growthRate),
      side: typeof parsed.side === "string" && parsed.side ? parsed.side : DEFAULTS.side,
      selectedDigit: numberOr(parsed.selectedDigit, DEFAULTS.selectedDigit),
      autoRun: parsed.autoRun === true,
    };
  } catch {
    return null;
  }
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
