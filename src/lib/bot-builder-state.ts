import { BOT_PRESET_CONFIGS, type BotPresetConfig } from "@/lib/bot-presets";
import { readDeployedBotPresetIds } from "@/lib/bot-preset-storage";

export type BotBuilderDurationUnit = "m" | "s" | "t";
export type BotBuilderTradeType =
  | "digits"
  | "higher_lower"
  | "multiplier"
  | "rise_fall"
  | "touch_no_touch";
export type BotBuilderDigitContract = "even_odd" | "matches_differs" | "over_under";

export type BotBuilderSettings = {
  assetCategory: string;
  candleInterval: string;
  conditionJoin: "All" | "Any";
  conditionLeft: string;
  conditionOperator: string;
  conditionRight: string;
  currency: string;
  digitContract: BotBuilderDigitContract;
  duration: number;
  durationUnit: BotBuilderDurationUnit;
  market: string;
  martingale: number;
  maxRuns: number;
  maxStake: number;
  purchaseDirection: string;
  restartBuySellOnError: boolean;
  restartLastTradeOnError: boolean;
  runOnceAtStart: boolean;
  selectedDigit: number;
  stake: number;
  stopLoss: number;
  symbol: string;
  takeProfit: number;
  tradeEveryTick: boolean;
  tradeType: BotBuilderTradeType;
};

export type SavedBotPreset = {
  id: string;
  name: string;
  savedAt: string;
  settings: BotBuilderSettings;
  source: "deployed" | "imported" | "manual";
};

const CURRENT_SETTINGS_STORAGE_VERSION = 1;
const SAVED_PRESETS_STORAGE_VERSION = 1;

export const initialBotBuilderSettings: BotBuilderSettings = {
  assetCategory: "Continuous Indices",
  candleInterval: "1 minute",
  conditionJoin: "All",
  conditionLeft: "Last Digit",
  conditionOperator: ">",
  conditionRight: "3",
  currency: "USD",
  digitContract: "over_under",
  duration: 1,
  durationUnit: "t",
  market: "Derived",
  martingale: 1.5,
  maxRuns: 1,
  maxStake: 500,
  purchaseDirection: "over",
  restartBuySellOnError: true,
  restartLastTradeOnError: true,
  runOnceAtStart: true,
  selectedDigit: 4,
  stake: 1,
  stopLoss: 30,
  symbol: "R_10",
  takeProfit: 100,
  tradeEveryTick: false,
  tradeType: "digits",
};

function currentSettingsStorageKey(userId?: string | null) {
  return `arktrader:bot-builder:${userId ?? "guest"}:current-settings`;
}

function savedPresetsStorageKey(userId?: string | null) {
  return `arktrader:bot-builder:${userId ?? "guest"}:saved-presets`;
}

export function readCurrentBotSettings(userId?: string | null) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(currentSettingsStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== CURRENT_SETTINGS_STORAGE_VERSION) return null;
    if (!isRecord(parsed.settings)) return null;
    return settingsFromRecord(parsed.settings);
  } catch {
    return null;
  }
}

export function readSavedBotPresets(userId?: string | null): SavedBotPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(savedPresetsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== SAVED_PRESETS_STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.presets)) return [];
    return parsed.presets
      .map(savedPresetFromRecord)
      .filter((preset): preset is SavedBotPreset => Boolean(preset));
  } catch {
    return [];
  }
}

export function settingsFromBotPreset(preset: BotPresetConfig): BotBuilderSettings {
  const stake = Number(preset.stake) || initialBotBuilderSettings.stake;
  const martingale = Number(preset.martingale) || initialBotBuilderSettings.martingale;
  const direction = preset.contractType.toLowerCase();
  const condition =
    preset.tradeType === "even_odd"
      ? {
          conditionOperator: "contains",
          conditionRight: direction === "odd" ? "1,3,5,7,9" : "0,2,4,6,8",
        }
      : preset.tradeType === "matches_differs"
        ? {
            conditionOperator: direction === "matches" ? "=" : ">",
            conditionRight:
              direction === "matches"
                ? String(preset.predictionDigit)
                : String(Math.max(0, preset.predictionDigit - 1)),
          }
        : {
            conditionOperator: direction === "under" ? "<" : ">",
            conditionRight: String(
              direction === "under"
                ? Math.min(9, preset.predictionDigit + 1)
                : Math.max(0, preset.predictionDigit - 1),
            ),
          };

  return normalizeBotBuilderSettings({
    ...initialBotBuilderSettings,
    conditionLeft: "Last Digit",
    conditionOperator: condition.conditionOperator,
    conditionRight: condition.conditionRight,
    digitContract: preset.tradeType,
    duration: preset.duration,
    durationUnit: preset.durationUnit,
    martingale,
    maxRuns: preset.maxRuns,
    maxStake: Math.max(stake, stake * Math.max(1, martingale) * 8),
    purchaseDirection: direction,
    selectedDigit: preset.predictionDigit,
    stake,
    stopLoss: preset.sl,
    symbol: preset.market,
    takeProfit: preset.tp,
    tradeType: "digits",
  });
}

export function resolveRunnableBotSettings(userId?: string | null) {
  const savedPreset = readSavedBotPresets(userId)[0];
  if (savedPreset) return savedPreset.settings;

  const deployedPresetId = readDeployedBotPresetIds(userId).at(-1);
  if (deployedPresetId) {
    const deployedPreset = BOT_PRESET_CONFIGS.find((preset) => preset.id === deployedPresetId);
    if (deployedPreset) return settingsFromBotPreset(deployedPreset);
  }

  const currentSettings = readCurrentBotSettings(userId);
  if (currentSettings && hasMeaningfulBotBuilderState(currentSettings)) {
    return currentSettings;
  }

  return null;
}

export function normalizeBotBuilderSettings(settings: BotBuilderSettings): BotBuilderSettings {
  const patch: Partial<BotBuilderSettings> = {};
  if (settings.tradeType !== "digits") {
    patch.digitContract = "even_odd";
  }
  if (
    !purchaseDirectionOptions(settings).some((item) => item.value === settings.purchaseDirection)
  ) {
    patch.purchaseDirection = purchaseDirectionOptions(settings)[0]?.value ?? "even";
  }
  const digitContract = patch.digitContract ?? settings.digitContract;
  const purchaseDirection = patch.purchaseDirection ?? settings.purchaseDirection;
  let selectedDigit = Math.max(0, Math.min(9, Math.round(Number(settings.selectedDigit) || 0)));
  if (settings.tradeType === "digits" && digitContract === "over_under") {
    if (purchaseDirection === "over") selectedDigit = Math.min(8, selectedDigit);
    if (purchaseDirection === "under") selectedDigit = Math.max(1, selectedDigit);
  }
  return {
    ...settings,
    ...patch,
    duration: Math.max(1, Math.round(Number(settings.duration) || 1)),
    martingale: clampNumber(settings.martingale, 1, 100),
    maxRuns: Math.max(1, Math.round(Number(settings.maxRuns) || 1)),
    maxStake: clampNumber(settings.maxStake, 0.35, 50000),
    selectedDigit,
    stake: clampNumber(settings.stake, 0.35, 50000),
    stopLoss: Math.max(0, Number(settings.stopLoss) || 0),
    takeProfit: Math.max(0, Number(settings.takeProfit) || 0),
  };
}

function hasMeaningfulBotBuilderState(settings: BotBuilderSettings) {
  const baseline = normalizeBotBuilderSettings(initialBotBuilderSettings);
  const current = normalizeBotBuilderSettings(settings);
  return (
    current.symbol !== baseline.symbol ||
    current.digitContract !== baseline.digitContract ||
    current.purchaseDirection !== baseline.purchaseDirection ||
    current.selectedDigit !== baseline.selectedDigit ||
    current.stake !== baseline.stake ||
    current.martingale !== baseline.martingale ||
    current.maxRuns !== baseline.maxRuns ||
    current.takeProfit !== baseline.takeProfit ||
    current.stopLoss !== baseline.stopLoss ||
    current.conditionOperator !== baseline.conditionOperator ||
    current.conditionRight !== baseline.conditionRight ||
    current.tradeEveryTick !== baseline.tradeEveryTick
  );
}

function savedPresetFromRecord(value: unknown) {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const source = value.source;
  return {
    id: readString(value, "id", "saved-bot-preset"),
    name: readString(value, "name", "Saved bot preset"),
    savedAt: readString(value, "savedAt", new Date().toISOString()),
    settings: settingsFromRecord(value.settings),
    source:
      source === "deployed" || source === "imported" || source === "manual" ? source : "manual",
  } satisfies SavedBotPreset;
}

function settingsFromRecord(record: Record<string, unknown>): BotBuilderSettings {
  const isPresetLike =
    typeof record.contractType === "string" &&
    typeof record.tradeType === "string" &&
    ("tp" in record || "sl" in record || "predictionDigit" in record);
  if (isPresetLike) {
    const stake = readNumber(record, "stake", initialBotBuilderSettings.stake);
    const martingale = readNumber(record, "martingale", initialBotBuilderSettings.martingale);
    const digitContract = digitContractValue(record.tradeType, initialBotBuilderSettings.digitContract);
    const selectedDigit = readNumber(
      record,
      "predictionDigit",
      initialBotBuilderSettings.selectedDigit,
    );
    const purchaseDirection = readString(
      record,
      "contractType",
      initialBotBuilderSettings.purchaseDirection,
    );
    const condition =
      digitContract === "even_odd"
        ? {
            conditionOperator: "contains",
            conditionRight: purchaseDirection === "odd" ? "1,3,5,7,9" : "0,2,4,6,8",
          }
        : digitContract === "matches_differs"
          ? {
              conditionOperator: purchaseDirection === "matches" ? "=" : ">",
              conditionRight:
                purchaseDirection === "matches"
                  ? String(selectedDigit)
                  : String(Math.max(0, selectedDigit - 1)),
            }
          : {
              conditionOperator: purchaseDirection === "under" ? "<" : ">",
              conditionRight: String(
                purchaseDirection === "under"
                  ? Math.min(9, selectedDigit + 1)
                  : Math.max(0, selectedDigit - 1),
              ),
            };
    return normalizeBotBuilderSettings({
      ...initialBotBuilderSettings,
      conditionOperator: condition.conditionOperator,
      conditionRight: condition.conditionRight,
      digitContract,
      duration: readNumber(record, "duration", initialBotBuilderSettings.duration),
      durationUnit: durationUnitValue(record.durationUnit, initialBotBuilderSettings.durationUnit),
      martingale,
      maxRuns: readNumber(record, "maxRuns", initialBotBuilderSettings.maxRuns),
      maxStake: Math.max(stake, stake * Math.max(1, martingale) * 8),
      purchaseDirection,
      selectedDigit,
      stake,
      stopLoss: readNumber(record, "sl", initialBotBuilderSettings.stopLoss),
      symbol: readString(record, "market", initialBotBuilderSettings.symbol),
      takeProfit: readNumber(record, "tp", initialBotBuilderSettings.takeProfit),
      tradeType: "digits",
    });
  }

  return normalizeBotBuilderSettings({
    ...initialBotBuilderSettings,
    assetCategory: readString(record, "assetCategory", initialBotBuilderSettings.assetCategory),
    candleInterval: readString(record, "candleInterval", initialBotBuilderSettings.candleInterval),
    conditionJoin: conditionJoinValue(record.conditionJoin, initialBotBuilderSettings.conditionJoin),
    conditionLeft: readString(record, "conditionLeft", initialBotBuilderSettings.conditionLeft),
    conditionOperator: readString(
      record,
      "conditionOperator",
      initialBotBuilderSettings.conditionOperator,
    ),
    conditionRight: readString(record, "conditionRight", initialBotBuilderSettings.conditionRight),
    currency: readString(record, "currency", initialBotBuilderSettings.currency),
    digitContract: digitContractValue(
      record.digitContract,
      initialBotBuilderSettings.digitContract,
    ),
    duration: readNumber(record, "duration", initialBotBuilderSettings.duration),
    durationUnit: durationUnitValue(record.durationUnit, initialBotBuilderSettings.durationUnit),
    market: readString(record, "market", initialBotBuilderSettings.market),
    martingale: readNumber(record, "martingale", initialBotBuilderSettings.martingale),
    maxRuns: readNumber(record, "maxRuns", initialBotBuilderSettings.maxRuns),
    maxStake: readNumber(record, "maxStake", initialBotBuilderSettings.maxStake),
    purchaseDirection: readString(
      record,
      "purchaseDirection",
      initialBotBuilderSettings.purchaseDirection,
    ),
    restartBuySellOnError: readBoolean(
      record,
      "restartBuySellOnError",
      initialBotBuilderSettings.restartBuySellOnError,
    ),
    restartLastTradeOnError: readBoolean(
      record,
      "restartLastTradeOnError",
      initialBotBuilderSettings.restartLastTradeOnError,
    ),
    runOnceAtStart: readBoolean(
      record,
      "runOnceAtStart",
      initialBotBuilderSettings.runOnceAtStart,
    ),
    selectedDigit: readNumber(record, "selectedDigit", initialBotBuilderSettings.selectedDigit),
    stake: readNumber(record, "stake", initialBotBuilderSettings.stake),
    stopLoss: readNumber(record, "stopLoss", initialBotBuilderSettings.stopLoss),
    symbol: readString(record, "symbol", initialBotBuilderSettings.symbol),
    takeProfit: readNumber(record, "takeProfit", initialBotBuilderSettings.takeProfit),
    tradeEveryTick: readBoolean(
      record,
      "tradeEveryTick",
      initialBotBuilderSettings.tradeEveryTick,
    ),
    tradeType: tradeTypeValue(record.tradeType, initialBotBuilderSettings.tradeType),
  });
}

function purchaseDirectionOptions(settings: BotBuilderSettings) {
  const category = settings.tradeType === "digits" ? settings.digitContract : settings.tradeType;
  if (category === "even_odd") {
    return [
      { label: "Even", value: "even" },
      { label: "Odd", value: "odd" },
    ];
  }
  if (category === "over_under") {
    return [
      { label: "Over", value: "over" },
      { label: "Under", value: "under" },
    ];
  }
  if (category === "matches_differs") {
    return [
      { label: "Matches", value: "matches" },
      { label: "Differs", value: "differs" },
    ];
  }
  if (category === "rise_fall") {
    return [
      { label: "Rise", value: "up" },
      { label: "Fall", value: "down" },
    ];
  }
  if (category === "higher_lower") {
    return [
      { label: "Higher", value: "higher" },
      { label: "Lower", value: "lower" },
    ];
  }
  if (category === "touch_no_touch") {
    return [
      { label: "Touch", value: "touch" },
      { label: "No Touch", value: "no_touch" },
    ];
  }
  return [
    { label: "Multiplier Up", value: "up" },
    { label: "Multiplier Down", value: "down" },
  ];
}

function clampNumber(value: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function durationUnitValue(
  value: unknown,
  fallback: BotBuilderDurationUnit,
): BotBuilderDurationUnit {
  if (value === "m" || value === "s" || value === "t") return value;
  if (value === "minutes") return "m";
  if (value === "seconds") return "s";
  if (value === "ticks") return "t";
  return fallback;
}

function digitContractValue(
  value: unknown,
  fallback: BotBuilderDigitContract,
): BotBuilderDigitContract {
  if (value === "even_odd" || value === "matches_differs" || value === "over_under") {
    return value;
  }
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("over") || normalized.includes("under")) return "over_under";
  if (normalized.includes("match") || normalized.includes("differ")) return "matches_differs";
  if (normalized.includes("even") || normalized.includes("odd")) return "even_odd";
  return fallback;
}

function tradeTypeValue(value: unknown, fallback: BotBuilderTradeType): BotBuilderTradeType {
  if (
    value === "digits" ||
    value === "higher_lower" ||
    value === "multiplier" ||
    value === "rise_fall" ||
    value === "touch_no_touch"
  ) {
    return value;
  }
  return fallback;
}

function conditionJoinValue(value: unknown, fallback: "All" | "Any") {
  return value === "All" || value === "Any" ? value : fallback;
}
