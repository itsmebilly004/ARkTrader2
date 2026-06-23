import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type TradingBotIconKey = "brain" | "cpu" | "flame" | "rocket" | "shield" | "target" | "zap";

export type TradingBotAsset = {
  contractType: string;
  desc: string;
  fileMatch: string;
  iconKey: TradingBotIconKey;
  id: string;
  market: string;
  name: string;
  tradeType: string;
};

export type DatabaseTradingBotPreset = TradingBotAsset & {
  databaseId: string;
  updatedAt: string;
  xml: string;
};

type BotRow = {
  id: string;
  name: string;
  strategy: Json;
  updated_at: string;
};

const STRATEGY_KIND = "arktrader.asset-bot-xml";
const STRATEGY_VERSION = 1;

const assetXmlModules = import.meta.glob<string>("/src/assets/*.xml", {
  import: "default",
  query: "?raw",
});

export const TRADING_BOT_ASSETS: TradingBotAsset[] = [
  {
    id: "under-destroyer-v2",
    name: "Underpro 3",
    iconKey: "shield",
    desc: "Aggressive Digit Under strategy loaded from the Under Destroyer v2 XML asset.",
    fileMatch: "Under_Destroyer_v2",
    market: "1HZ10V",
    tradeType: "Over/Under",
    contractType: "Under",
  },
  {
    id: "nova-v6",
    name: "ArkTraders Nova Stalker",
    iconKey: "cpu",
    desc: "Adaptive Digit Under strategy loaded from the Nova XML asset.",
    fileMatch: "Nova_Digit_Harvester",
    market: "1HZ100V",
    tradeType: "Over/Under",
    contractType: "Under",
  },
  {
    id: "mega-mind",
    name: "ArkTraders MegaMind Surge",
    iconKey: "brain",
    desc: "Digit Over scalper loaded directly from the Mega Mind XML asset.",
    fileMatch: "Mega_Mind",
    market: "1HZ10V",
    tradeType: "Over/Under",
    contractType: "Over",
  },
  {
    id: "phantom-hit-run",
    name: "ArkTraders Phantom HitRun",
    iconKey: "flame",
    desc: "Rise/Fall hit-and-run strategy loaded from the Phantom XML asset.",
    fileMatch: "Phantom HitRun",
    market: "R_100",
    tradeType: "Rise/Fall",
    contractType: "Fall",
  },
  {
    id: "candle-mine",
    name: "ArkTraders CandleVault Sentinel",
    iconKey: "zap",
    desc: "Digit Differs strategy loaded from the Candle Mine XML asset.",
    fileMatch: "Candle-mine",
    market: "R_100",
    tradeType: "Matches/Differs",
    contractType: "Differs",
  },
  {
    id: "dec-entry",
    name: "ArkTraders Entry Point Sniper",
    iconKey: "target",
    desc: "Entry-point Digit Over setup loaded from the DEC XML asset.",
    fileMatch: "dec  entry point",
    market: "1HZ10V",
    tradeType: "Over/Under",
    contractType: "Over",
  },
  {
    id: "under-pro-sentinel",
    name: "ArkTraders UnderPro Sentinel",
    iconKey: "shield",
    desc: "Precision Digit Under sentinel strategy on 1HZ10V, loaded from the UnderPro Sentinel XML asset.",
    fileMatch: "ArkTraders UnderPro Sentinel",
    market: "1HZ10V",
    tradeType: "Over/Under",
    contractType: "Under",
  },
  {
    id: "osam-auto-pilot",
    name: "ArkTraders AutoBot Pro",
    iconKey: "rocket",
    desc: "Fully automated Over/Under pilot strategy on 1HZ10V, loaded from the AutoPilot XML asset.",
    fileMatch: "ArkTraders Osam AutoPilot",
    market: "1HZ10V",
    tradeType: "Over/Under",
    contractType: "Over/Under",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strategyPresetId(strategy: Json): string | null {
  if (!isRecord(strategy)) return null;
  return strategy.kind === STRATEGY_KIND && typeof strategy.presetId === "string"
    ? strategy.presetId
    : null;
}

function strategyXml(strategy: Json): string | null {
  if (!isRecord(strategy)) return null;
  return strategy.kind === STRATEGY_KIND && typeof strategy.xml === "string" ? strategy.xml : null;
}

function strategyDocument(asset: TradingBotAsset, xml: string): Json {
  return {
    assetFileMatch: asset.fileMatch,
    contractType: asset.contractType,
    kind: STRATEGY_KIND,
    market: asset.market,
    presetId: asset.id,
    source: "src/assets",
    tradeType: asset.tradeType,
    version: STRATEGY_VERSION,
    xml,
  };
}

function assetForId(presetId: string): TradingBotAsset {
  const asset = TRADING_BOT_ASSETS.find((item) => item.id === presetId);
  if (!asset) throw new Error("That bot preset is not registered in the trading bot library.");
  return asset;
}

async function loadTradingBotAssetXml(asset: TradingBotAsset): Promise<string> {
  const entry = Object.entries(assetXmlModules).find(([path]) => path.includes(asset.fileMatch));
  if (!entry) {
    throw new Error(`Could not find the XML asset for ${asset.name}.`);
  }
  const [, loader] = entry;
  return (await loader()).replace(/^\uFEFF/, "").trim();
}

function rowToPreset(row: BotRow): DatabaseTradingBotPreset | null {
  const presetId = strategyPresetId(row.strategy);
  const xml = strategyXml(row.strategy);
  if (!presetId || !xml) return null;
  const asset = TRADING_BOT_ASSETS.find((item) => item.id === presetId);
  if (!asset) return null;
  return {
    ...asset,
    databaseId: row.id,
    name: row.name || asset.name,
    updatedAt: row.updated_at,
    xml,
  };
}

async function fetchPresetRows(userId: string): Promise<BotRow[]> {
  const { data, error } = await supabase
    .from("bots")
    .select("id,name,strategy,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BotRow[];
}

export async function ensureTradingBotDatabasePresets(
  userId: string,
): Promise<DatabaseTradingBotPreset[]> {
  const rows = await fetchPresetRows(userId);
  const rowByPresetId = new Map<string, BotRow>();
  for (const row of rows) {
    const presetId = strategyPresetId(row.strategy);
    if (presetId && !rowByPresetId.has(presetId)) rowByPresetId.set(presetId, row);
  }

  for (const asset of TRADING_BOT_ASSETS) {
    try {
      const xml = await loadTradingBotAssetXml(asset);
      const strategy = strategyDocument(asset, xml);
      const existing = rowByPresetId.get(asset.id);
      if (existing) {
        if (existing.name !== asset.name || strategyXml(existing.strategy) !== xml) {
          const { error } = await supabase
            .from("bots")
            .update({ name: asset.name, status: "stopped", strategy })
            .eq("id", existing.id)
            .eq("user_id", userId);
          if (error) console.warn(`[trading-bots] failed to update ${asset.name}:`, error);
        }
        continue;
      }

      const { error } = await supabase.from("bots").insert({
        name: asset.name,
        status: "stopped",
        strategy,
        user_id: userId,
      });
      if (error) console.warn(`[trading-bots] failed to insert ${asset.name}:`, error);
    } catch (err) {
      console.warn(`[trading-bots] skipped ${asset.name} — could not load XML asset:`, err);
    }
  }

  return fetchTradingBotDatabasePresets(userId);
}

export async function fetchTradingBotDatabasePresets(
  userId: string,
): Promise<DatabaseTradingBotPreset[]> {
  const rows = await fetchPresetRows(userId);
  const presets = rows
    .map(rowToPreset)
    .filter((preset): preset is DatabaseTradingBotPreset => Boolean(preset));
  const byPresetId = new Map<string, DatabaseTradingBotPreset>();
  for (const preset of presets) {
    if (!byPresetId.has(preset.id)) byPresetId.set(preset.id, preset);
  }
  return TRADING_BOT_ASSETS.map((asset) => byPresetId.get(asset.id)).filter(
    (preset): preset is DatabaseTradingBotPreset => Boolean(preset),
  );
}

export async function fetchTradingBotPresetFromDatabase(
  userId: string,
  presetId: string,
): Promise<DatabaseTradingBotPreset> {
  const asset = assetForId(presetId);

  // Always ensure the DB is up-to-date so fresh deploys work even if the
  // trading-bots page hasn't been visited yet (which seeds the database).
  await ensureTradingBotDatabasePresets(userId);

  const presets = await fetchTradingBotDatabasePresets(userId);
  const preset = presets.find((item) => item.id === asset.id);

  if (!preset?.xml) {
    throw new Error(
      `Could not load the XML for ${asset.name}. Make sure the XML asset file exists in the project and try again.`,
    );
  }
  return preset;
}
