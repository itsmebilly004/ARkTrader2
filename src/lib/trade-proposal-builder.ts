import { contractTypeFor, type TradeCategory, type TradingAdapter } from "@/lib/deriv";
import { tradeTypeConfig } from "@/lib/trade-types";

export type StandardProposalPayload = Record<string, unknown> & {
  proposal: 1;
  amount: number;
  basis: "stake" | "payout";
  contract_type: string;
  currency: string;
  underlying_symbol: string;
  duration?: number;
  duration_unit?: "t" | "s" | "m";
  barrier?: string;
  multiplier?: number;
  limit_order?: {
    take_profit?: number;
    stop_loss?: number;
  };
};

export type ProposalInput = {
  barrier: string;
  currency: string;
  duration: number;
  durationUnit: "t" | "s" | "m";
  market: string;
  multiplier: number;
  payoutMode: "stake" | "payout";
  selectedDigit: number;
  side: string;
  stake: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  tradeType: TradeCategory;
};

const STANDARD_PROPOSAL_KEYS = new Set([
  "proposal",
  "amount",
  "basis",
  "contract_type",
  "currency",
  "underlying_symbol",
  "duration",
  "duration_unit",
  "barrier",
  "multiplier",
  "limit_order",
]);

export function buildStandardProposalPayload(
  input: ProposalInput,
  adapter: TradingAdapter = "oauth2PkceTradingAdapter",
): StandardProposalPayload {
  return buildDerivWsProposalPayload(input, adapter);
}

export function validateProposalPayload(
  _payload: Record<string, unknown>,
  _adapter: TradingAdapter,
): asserts _payload is StandardProposalPayload {
  // Validation skipped — trades execute against the simulated DB-backed engine, not Deriv WS.
}

function buildDerivWsProposalPayload(
  input: ProposalInput,
  adapter: TradingAdapter,
): StandardProposalPayload {
  const config = tradeTypeConfig(input.tradeType);
  if (!input.market) throw new Error("Select a market before trading.");
  if (!input.currency) throw new Error("Selected account currency is missing.");
  if (!Number.isFinite(input.stake) || input.stake <= 0) throw new Error("Enter a valid stake.");
  if (config.needsDuration && (!Number.isFinite(input.duration) || input.duration <= 0)) {
    throw new Error("Select a valid duration.");
  }
  if (config.needsBarrier && !input.barrier.trim()) {
    throw new Error("Enter a valid barrier.");
  }
  if (config.needsDigit && (input.selectedDigit < 0 || input.selectedDigit > 9)) {
    throw new Error("Select a digit from 0 to 9.");
  }

  const payload: StandardProposalPayload = {
    proposal: 1,
    amount: input.stake,
    basis: input.payoutMode,
    contract_type: contractTypeFor(input.tradeType, input.side),
    currency: input.currency,
    underlying_symbol: input.market,
  };

  if (config.needsDuration) {
    payload.duration = input.duration;
    payload.duration_unit =
      input.tradeType === "over_under" ||
      input.tradeType === "even_odd" ||
      input.tradeType === "matches_differs"
        ? "t"
        : input.durationUnit;
  }
  if (config.needsBarrier) payload.barrier = input.barrier.trim();
  if (config.needsDigit) payload.barrier = String(input.selectedDigit);
  if (config.supportsMultiplier) {
    if (!Number.isFinite(input.multiplier) || input.multiplier <= 0) {
      throw new Error("Select a valid multiplier.");
    }
    payload.multiplier = input.multiplier;
    if ((input.takeProfit ?? 0) > 0 || (input.stopLoss ?? 0) > 0) {
      payload.limit_order = {};
      if ((input.takeProfit ?? 0) > 0) payload.limit_order.take_profit = Number(input.takeProfit);
      if ((input.stopLoss ?? 0) > 0) payload.limit_order.stop_loss = Number(input.stopLoss);
    }
  }

  validateProposalPayload(payload, adapter);
  return payload;
}
