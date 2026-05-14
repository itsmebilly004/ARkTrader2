import type { TradeCategory } from "@/lib/deriv";

export type TradeSide = {
  value: string;
  label: string;
  tone: "up" | "down";
};

export type TradeTypeConfig = {
  category: TradeCategory;
  label: string;
  icon: string;
  description: string;
  sides: TradeSide[];
  needsDuration: boolean;
  needsBarrier: boolean;
  needsDigit: boolean;
  digitMode?: "barrier" | "prediction" | "parity";
  supportsEarlySell: boolean;
  supportsMultiplier: boolean;
};

export const TRADE_TYPE_CONFIGS: TradeTypeConfig[] = [
  {
    category: "accumulator",
    label: "Accumulators",
    icon: "A",
    description: "Grow payout while ticks stay inside Deriv's live barrier range.",
    sides: [{ value: "buy", label: "Buy", tone: "up" }],
    needsDuration: false,
    needsBarrier: false,
    needsDigit: false,
    supportsEarlySell: true,
    supportsMultiplier: false,
  },
  {
    category: "rise_fall",
    label: "Rise/Fall",
    icon: "RF",
    description: "Predict whether the exit spot is higher or lower than entry.",
    sides: [
      { value: "up", label: "Rise", tone: "up" },
      { value: "down", label: "Fall", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: false,
    needsDigit: false,
    supportsEarlySell: true,
    supportsMultiplier: false,
  },
  {
    category: "higher_lower",
    label: "Higher/Lower",
    icon: "HL",
    description: "Predict whether the exit spot finishes above or below a barrier.",
    sides: [
      { value: "higher", label: "Higher", tone: "up" },
      { value: "lower", label: "Lower", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: true,
    needsDigit: false,
    supportsEarlySell: true,
    supportsMultiplier: false,
  },
  {
    category: "touch_no_touch",
    label: "Touch/No Touch",
    icon: "TN",
    description: "Predict whether the market touches a barrier before expiry.",
    sides: [
      { value: "touch", label: "Touch", tone: "up" },
      { value: "no_touch", label: "No Touch", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: true,
    needsDigit: false,
    supportsEarlySell: true,
    supportsMultiplier: false,
  },
  {
    category: "matches_differs",
    label: "Matches/Differs",
    icon: "9",
    description: "Predict whether the final digit matches your selected digit.",
    sides: [
      { value: "matches", label: "Matches", tone: "up" },
      { value: "differs", label: "Differs", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: false,
    needsDigit: true,
    digitMode: "prediction",
    supportsEarlySell: false,
    supportsMultiplier: false,
  },
  {
    category: "even_odd",
    label: "Even/Odd",
    icon: "2",
    description: "Predict whether the final digit is even or odd.",
    sides: [
      { value: "even", label: "Even", tone: "up" },
      { value: "odd", label: "Odd", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: false,
    needsDigit: false,
    digitMode: "parity",
    supportsEarlySell: false,
    supportsMultiplier: false,
  },
  {
    category: "over_under",
    label: "Over/Under",
    icon: "5",
    description: "Predict whether the final digit is over or under your barrier.",
    sides: [
      { value: "over", label: "Over", tone: "up" },
      { value: "under", label: "Under", tone: "down" },
    ],
    needsDuration: true,
    needsBarrier: false,
    needsDigit: true,
    digitMode: "barrier",
    supportsEarlySell: false,
    supportsMultiplier: false,
  },
  {
    category: "multiplier",
    label: "Multipliers",
    icon: "x",
    description: "Amplify market movement with take profit and stop loss controls.",
    sides: [
      { value: "up", label: "Multiplier Up", tone: "up" },
      { value: "down", label: "Multiplier Down", tone: "down" },
    ],
    needsDuration: false,
    needsBarrier: false,
    needsDigit: false,
    supportsEarlySell: true,
    supportsMultiplier: true,
  },
];

export function tradeTypeConfig(category: TradeCategory) {
  return TRADE_TYPE_CONFIGS.find((config) => config.category === category) ?? TRADE_TYPE_CONFIGS[0];
}

export function isDigitTrade(category: TradeCategory) {
  return category === "over_under" || category === "even_odd" || category === "matches_differs";
}
