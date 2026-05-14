type DerivRecord = Record<string, unknown>;

export type ActiveContractStatus =
  | "idle"
  | "proposing"
  | "ready"
  | "buying"
  | "active"
  | "sold"
  | "won"
  | "lost"
  | "error";

export type ActiveContractState = {
  buyPrice: number | null;
  contractId: string | null;
  currentProfit: number | null;
  currentSpot: number | null;
  entrySpot: number | null;
  expiryTime: number | null;
  isValidToSell: boolean;
  payout: number | null;
  sellPrice: number | null;
  status: ActiveContractStatus;
  error: string | null;
};

export const EMPTY_CONTRACT_STATE: ActiveContractState = {
  buyPrice: null,
  contractId: null,
  currentProfit: null,
  currentSpot: null,
  entrySpot: null,
  expiryTime: null,
  isValidToSell: false,
  payout: null,
  sellPrice: null,
  status: "idle",
  error: null,
};

export function normalizeOpenContract(
  contract: DerivRecord,
  previous: ActiveContractState = EMPTY_CONTRACT_STATE,
): ActiveContractState {
  const profit = numberFrom(contract.profit, previous.currentProfit);
  const isSold = booleanFrom(contract.is_sold);
  const isExpired = booleanFrom(contract.is_expired);
  const contractStatus = String(contract.status ?? "").toLowerCase();
  const status: ActiveContractStatus =
    isSold || isExpired
      ? profit != null && profit >= 0
        ? "won"
        : "lost"
      : contractStatus.includes("lost")
        ? "lost"
        : contractStatus.includes("won")
          ? "won"
          : "active";

  const sellPrice = numberFrom(contract.sell_price, contract.bid_price, previous.sellPrice);
  return {
    ...previous,
    buyPrice: numberFrom(contract.buy_price, previous.buyPrice),
    contractId: String(contract.contract_id ?? previous.contractId ?? "") || null,
    currentProfit: profit,
    currentSpot: numberFrom(
      contract.current_spot,
      contract.current_tick,
      contract.current_spot_display_value,
      previous.currentSpot,
    ),
    entrySpot: numberFrom(
      contract.entry_spot,
      contract.entry_tick,
      contract.entry_tick_display_value,
      previous.entrySpot,
    ),
    expiryTime: numberFrom(contract.date_expiry, contract.expiry_time, previous.expiryTime),
    isValidToSell:
      booleanFrom(contract.is_valid_to_sell) && sellPrice != null && status === "active",
    payout: numberFrom(contract.payout, contract.bid_price, contract.sell_price, previous.payout),
    sellPrice,
    status,
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
