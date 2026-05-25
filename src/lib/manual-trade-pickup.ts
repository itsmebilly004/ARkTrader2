import type { TradeCategory } from "@/lib/deriv";

const PICKUP_KEY = "arktrader:manual-trade-pickup";

export type ManualTradePickup = {
  stake: number;
  symbol: string;
  tradeType: TradeCategory;
};

export function setManualTradePickup(pickup: ManualTradePickup): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PICKUP_KEY, JSON.stringify(pickup));
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
    const tradeType = typeof parsed.tradeType === "string" && parsed.tradeType ? parsed.tradeType : null;
    const stake = typeof parsed.stake === "number" && parsed.stake > 0 ? parsed.stake : null;
    if (!symbol || !tradeType || !stake) return null;
    return { stake, symbol, tradeType: tradeType as TradeCategory };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
