// Minimal slice of @/components/shared needed by the visual bot-builder blocks
// (no trade engine). Faithful values copied from
// src/assets/Deriv Backup/DDBOt/src/components/shared/utils/{currency,contract}/...

export const CRYPTO_CURRENCIES = ["BTC", "ETH", "LTC", "USDT", "USDC", "eUSDT", "tUSDT"];

export const getDecimalPlaces = (currency = "USD"): number => {
  const upper = currency.toUpperCase();
  if (CRYPTO_CURRENCIES.includes(upper)) return 8;
  if (upper === "USDT" || upper === "USDC" || upper === "eUSDT" || upper === "tUSDT") return 2;
  return 2;
};

export const getCurrencyDisplayCode = (currency = "USD"): string => {
  const upper = currency.toUpperCase();
  if (upper === "EUSDT") return "eUSDT";
  if (upper === "TUSDT") return "tUSDT";
  return upper;
};

export const getRoundedNumber = (value: number, currency = "USD"): number => {
  const places = getDecimalPlaces(currency);
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export const getFormattedText = (value: number, currency = "USD"): string =>
  `${getCurrencyDisplayCode(currency)} ${getRoundedNumber(value, currency).toFixed(getDecimalPlaces(currency))}`;

export const CONTRACT_TYPES = {
  ACCUMULATOR: "ACCU",
  ASIAN: { UP: "ASIANU", DOWN: "ASIAND" },
  CALL: "CALL",
  CALLE: "CALLE",
  CALL_BARRIER: "CALL_BARRIER",
  CALL_PUT_SPREAD: { CALL: "CALLSPREAD", PUT: "PUTSPREAD" },
  END: { IN: "EXPIRYRANGE", OUT: "EXPIRYMISS" },
  EVEN_ODD: { ODD: "DIGITODD", EVEN: "DIGITEVEN" },
  EXPIRYRANGEE: "EXPIRYRANGEE",
  FALL: "FALL",
  HIGHER: "HIGHER",
  LB_HIGH_LOW: "LBHIGHLOW",
  LB_CALL: "LBFLOATCALL",
  LB_PUT: "LBFLOATPUT",
  LOWER: "LOWER",
  MATCH_DIFF: { MATCH: "DIGITMATCH", DIFF: "DIGITDIFF" },
  MULTIPLIER: { UP: "MULTUP", DOWN: "MULTDOWN" },
  OVER_UNDER: { OVER: "DIGITOVER", UNDER: "DIGITUNDER" },
  PUT: "PUT",
  PUTE: "PUTE",
  PUT_BARRIER: "PUT_BARRIER",
  RESET: { CALL: "RESETCALL", PUT: "RESETPUT" },
  RISE: "RISE",
  RUN_HIGH_LOW: { HIGH: "RUNHIGH", LOW: "RUNLOW" },
  STAY: { IN: "RANGE", OUT: "UPORDOWN" },
  TICK_HIGH_LOW: { HIGH: "TICKHIGH", LOW: "TICKLOW" },
  TOUCH: { ONE_TOUCH: "ONETOUCH", NO_TOUCH: "NOTOUCH" },
  TURBOS: { LONG: "TURBOSLONG", SHORT: "TURBOSSHORT" },
  VANILLA: { CALL: "VANILLALONGCALL", PUT: "VANILLALONGPUT" },
} as const;

export const TRADE_TYPES = {
  ACCUMULATOR: "accumulator",
  ASIAN: "asian",
  CALL_PUT_SPREAD: "callputspread",
  END: "end",
  EVEN_ODD: "even_odd",
  HIGH_LOW: "high_low",
  MATCH_DIFF: "match_diff",
  MULTIPLIER: "multiplier",
  OVER_UNDER: "over_under",
  RISE_FALL: "rise_fall",
  RISE_FALL_EQUAL: "rise_fall_equal",
  TOUCH: "touch",
} as const;

export const isMultiplierContract = (contract_type = "") =>
  /MULT(UP|DOWN)?/i.test(contract_type);

export const isAccumulatorContract = (contract_type = "") =>
  /ACCU/i.test(contract_type);

export const findValueByKeyRecursively = (obj: any, key: string): unknown => {
  if (obj == null || typeof obj !== "object") return undefined;
  if (key in obj) return (obj as Record<string, unknown>)[key];
  for (const k of Object.keys(obj)) {
    const found = findValueByKeyRecursively((obj as Record<string, unknown>)[k], key);
    if (found !== undefined) return found;
  }
  return undefined;
};

export const isEmptyObject = (obj: unknown): boolean => {
  if (obj == null || typeof obj !== "object") return true;
  return Object.keys(obj as Record<string, unknown>).length === 0;
};

export const formatTime = (epoch: number): string => {
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

export const getAppId = (): string => {
  if (typeof window !== "undefined") {
    const stored = window.localStorage?.getItem("deriv_app_id");
    if (stored) return stored;
  }
  return import.meta.env?.VITE_DERIV_APP_ID ?? "36300";
};

export const getSocketURL = (): string => {
  if (typeof window !== "undefined") {
    const stored = window.localStorage?.getItem("deriv_socket_url");
    if (stored) return stored;
  }
  return "frontend.derivws.com";
};
