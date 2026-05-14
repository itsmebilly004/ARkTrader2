import { contractTypeFor, type TradingAdapter } from "@/lib/deriv";

type DerivRecord = Record<string, unknown>;

export const ACCUMULATOR_GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05] as const;

export type AccumulatorStatus = "idle" | "proposing" | "active" | "sold" | "lost" | "error";
export type BarrierSource = "official" | "fallback" | "none";

export type AccumulatorProposalPayload = {
  proposal: 1;
  amount: number;
  basis: "stake";
  contract_type: string;
  currency: string;
  underlying_symbol: string;
  growth_rate: number;
  limit_order?: { take_profit: number };
};

export type AccumulatorContractState = {
  contractId: string | null;
  proposalId: string | null;
  entrySpot: number | null;
  currentSpot: number | null;
  upperBarrier: number | null;
  lowerBarrier: number | null;
  buyPrice: number | null;
  currentPayout: number | null;
  currentProfit: number | null;
  sellPrice: number | null;
  isValidToSell: boolean;
  status: AccumulatorStatus;
  barrierSource: BarrierSource;
  barrierBreached: boolean;
  tickCount: number | null;
  maxTicks: number | null;
  maxPayout: number | null;
  error: string | null;
};

export const EMPTY_ACCUMULATOR_CONTRACT: AccumulatorContractState = {
  contractId: null,
  proposalId: null,
  entrySpot: null,
  currentSpot: null,
  upperBarrier: null,
  lowerBarrier: null,
  buyPrice: null,
  currentPayout: null,
  currentProfit: null,
  sellPrice: null,
  isValidToSell: false,
  status: "idle",
  barrierSource: "none",
  barrierBreached: false,
  tickCount: null,
  maxTicks: null,
  maxPayout: null,
  error: null,
};

const ACCUMULATOR_PROPOSAL_KEYS = new Set([
  "proposal",
  "amount",
  "basis",
  "contract_type",
  "currency",
  "underlying_symbol",
  "growth_rate",
  "limit_order",
]);

export type AccumulatorProposalInput = {
  currency: string;
  growthRate: number;
  market: string;
  stake: number;
  takeProfit?: number | null;
};

export function buildAccumulatorProposalPayload(
  input: AccumulatorProposalInput,
  adapter: TradingAdapter = "oauth2PkceTradingAdapter",
): AccumulatorProposalPayload {
  return buildDerivWsAccumulatorProposalPayload(input, adapter);
}

export function validateAccumulatorProposalPayload(
  payload: Record<string, unknown>,
  adapter: TradingAdapter,
): asserts payload is AccumulatorProposalPayload {
  if ("symbol" in payload) {
    throw new Error(`Invalid ${adapter} accumulator payload: use underlying_symbol, not symbol.`);
  }
  for (const key of Object.keys(payload)) {
    if (!ACCUMULATOR_PROPOSAL_KEYS.has(key)) {
      throw new Error(`Invalid ${adapter} accumulator payload: unsupported property ${key}.`);
    }
  }
  if (payload.proposal !== 1) {
    throw new Error(`Invalid ${adapter} accumulator payload: proposal must be 1.`);
  }
  if (!payload.underlying_symbol || typeof payload.underlying_symbol !== "string") {
    throw new Error(`Invalid ${adapter} accumulator payload: underlying_symbol is required.`);
  }
  if (payload.contract_type !== "ACCU") {
    throw new Error(`Invalid ${adapter} accumulator payload: contract_type must be ACCU.`);
  }
}

function buildDerivWsAccumulatorProposalPayload(
  { currency, growthRate, market, stake, takeProfit }: AccumulatorProposalInput,
  adapter: TradingAdapter,
): AccumulatorProposalPayload {
  if (!market) throw new Error("Select a market before buying an accumulator.");
  if (!currency) throw new Error("Selected account currency is missing.");
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");
  if (!ACCUMULATOR_GROWTH_RATES.includes(growthRate as (typeof ACCUMULATOR_GROWTH_RATES)[number])) {
    throw new Error("Select a supported accumulator growth rate.");
  }

  const payload: AccumulatorProposalPayload = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: contractTypeFor("accumulator", "buy"),
    currency,
    underlying_symbol: market,
    growth_rate: growthRate,
  };
  if (takeProfit && takeProfit > 0) {
    payload.limit_order = { take_profit: takeProfit };
  }
  validateAccumulatorProposalPayload(payload, adapter);
  return payload;
}

export function normalizeAccumulatorContract(
  contract: DerivRecord,
  previous: AccumulatorContractState = EMPTY_ACCUMULATOR_CONTRACT,
): AccumulatorContractState {
  const entrySpot = numberFrom(
    contract.entry_spot,
    contract.entry_tick,
    contract.entry_tick_display_value,
    previous.entrySpot,
  );
  const currentSpot = numberFrom(
    contract.current_spot,
    contract.current_tick,
    contract.current_spot_display_value,
    previous.currentSpot,
  );
  const officialUpper = numberFrom(contract.high_barrier, contract.upper_barrier);
  const officialLower = numberFrom(contract.low_barrier, contract.lower_barrier);
  const tickSizeBarrier = numberFrom(contract.tick_size_barrier);
  const fallbackHigh =
    officialUpper ??
    (currentSpot != null && tickSizeBarrier != null ? currentSpot * (1 + tickSizeBarrier) : null);
  const fallbackLow =
    officialLower ??
    (currentSpot != null && tickSizeBarrier != null ? currentSpot * (1 - tickSizeBarrier) : null);

  const upperBarrier = officialUpper ?? fallbackHigh ?? previous.upperBarrier;
  const lowerBarrier = officialLower ?? fallbackLow ?? previous.lowerBarrier;
  const barrierSource: BarrierSource =
    officialUpper != null || officialLower != null
      ? "official"
      : fallbackHigh != null || fallbackLow != null
        ? "fallback"
        : previous.barrierSource;

  const currentProfit = numberFrom(contract.profit, previous.currentProfit);
  const sellPrice = numberFrom(contract.sell_price, contract.bid_price, previous.sellPrice);
  const currentPayout = numberFrom(contract.payout, contract.bid_price, contract.sell_price);
  const contractStatus = String(contract.status ?? "").toLowerCase();
  const isSold = booleanFrom(contract.is_sold);
  const isExpired = booleanFrom(contract.is_expired);
  const outsideRange =
    currentSpot != null &&
    upperBarrier != null &&
    lowerBarrier != null &&
    (currentSpot >= upperBarrier || currentSpot <= lowerBarrier);
  const lost =
    contractStatus.includes("lost") ||
    contractStatus.includes("barrier") ||
    (isSold && (currentProfit ?? 0) < 0) ||
    (booleanFrom(contract.is_settleable) && outsideRange);
  const status: AccumulatorStatus = lost
    ? "lost"
    : isSold || isExpired
      ? "sold"
      : previous.status === "proposing"
        ? "active"
        : previous.status === "idle"
          ? "active"
          : previous.status;

  return {
    ...previous,
    contractId: String(contract.contract_id ?? previous.contractId ?? "") || null,
    entrySpot,
    currentSpot,
    upperBarrier,
    lowerBarrier,
    buyPrice: numberFrom(contract.buy_price, previous.buyPrice),
    currentPayout: currentPayout ?? previous.currentPayout,
    currentProfit,
    sellPrice,
    isValidToSell:
      booleanFrom(contract.is_valid_to_sell) && sellPrice != null && status === "active",
    status,
    barrierSource,
    barrierBreached: lost || outsideRange,
    tickCount: numberFrom(contract.tick_count, contract.tick_passed, previous.tickCount),
    maxTicks: numberFrom(contract.maximum_ticks, previous.maxTicks),
    maxPayout: numberFrom(contract.maximum_payout, previous.maxPayout),
    error: null,
  };
}

export function numberFrom(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function booleanFrom(value: unknown) {
  return value === true || value === 1 || value === "1";
}
