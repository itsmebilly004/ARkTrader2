import {
  clearCurrentBotPresetId,
  normalizeBotBuilderSettings,
  persistCurrentBotPresetId,
  persistCurrentBotSettings,
  persistPresetWorkspaceXml,
  readPresetWorkspaceXml,
} from "@/lib/bot-builder-state";
import { TRADING_BOT_ASSETS } from "@/lib/trading-bot-database";
import { fetchBotXmlFromDatabase } from "@/lib/bot-xml-storage";
import {
  applyDeploymentParamsToBotXml,
  extractSettingsFromXmlText,
  writeSavedWorkspaceXml,
  type BotXmlTradeParams,
} from "@/external/bot-builder/workspace-persistence";
import { writeRecentWorkspaceXml } from "@/external/bot-builder/recent-workspaces";

// ─── Bot-deployed event ───────────────────────────────────────────────────────

export const BOT_DEPLOYED_EVENT = "arktrader:bot-deployed";

export type BotDeployedEventDetail = {
  presetId: string;
  source: "ai-assistant" | "trading-bots";
};

// ─── Builder memory import ────────────────────────────────────────────────────

export type BuilderMemoryImport = {
  name: string;
  xml: string;
  /** Optional bot preset ID — when provided, previously saved user edits for this
   *  preset are restored instead of overwriting with the fresh deployment XML. */
  presetId?: string;
};

function normalizeXml(xml: string): string {
  return xml.replace(/^﻿/, "").trim();
}

function isBlocklyXml(xml: string): boolean {
  return /<xml[\s>]/i.test(xml) || /<block[\s>]/i.test(xml);
}

/**
 * True when the XML still uses the deprecated single-block trade format
 * (`<block type="trade">` / `<block type="tradeOptions">`) instead of the modern
 * `trade_definition` chain that this app's Blockly runtime registers. Such XML
 * silently drops its trade-parameter blocks on load, so a cached copy in this
 * format must be discarded in favour of the fresh (migrated) asset XML.
 */
function isLegacyTradeFormat(xml: string): boolean {
  return /<block\s+type="trade"/i.test(xml) || /<block\s+type="tradeOptions"/i.test(xml);
}

export async function importBotXmlIntoBuilderMemory(
  userId: string | null | undefined,
  input: BuilderMemoryImport,
  tradeParams?: BotXmlTradeParams,
): Promise<void> {
  const freshXml = normalizeXml(input.xml);
  if (!isBlocklyXml(freshXml)) {
    throw new Error("The selected bot preset is not a Blockly XML strategy.");
  }

  // If a presetId is given, check whether the user already has edits for this
  // preset saved. If so, restore those instead of wiping them with the fresh
  // deployment XML — this preserves any block-level adjustments the user made.
  // Exception: a cached copy still in the deprecated `trade`/`tradeOptions`
  // format would drop its trade-parameter blocks on load, so we ignore it and
  // re-seed from the migrated asset XML instead.
  let workspaceXml = freshXml;
  if (input.presetId && userId) {
    const savedUserXml = readPresetWorkspaceXml(userId, input.presetId);
    if (savedUserXml && !isLegacyTradeFormat(savedUserXml)) {
      workspaceXml = savedUserXml;
    }
  }

  // Stamp the caller's stake / risk values into whichever workspace XML will be
  // loaded so the running bot uses exactly what the user entered, instead of the
  // preset's stock stake that `persistWorkspaceSnapshot` would otherwise restore.
  if (tradeParams) {
    workspaceXml = applyDeploymentParamsToBotXml(workspaceXml, tradeParams);
  }

  if (input.presetId) {
    persistCurrentBotPresetId(userId, input.presetId);
    // Seed (or refresh) the preset workspace store. We (re)write it when it's
    // empty OR when the stored copy is in the broken legacy format, so a user
    // who deployed the old version still gets the fixed strategy.
    const cached = readPresetWorkspaceXml(userId, input.presetId);
    if (!cached || isLegacyTradeFormat(cached)) {
      persistPresetWorkspaceXml(userId, input.presetId, freshXml);
    }
  } else {
    clearCurrentBotPresetId(userId);
    if (userId) clearCurrentBotPresetId(null);
  }

  writeSavedWorkspaceXml(userId, workspaceXml);
  await writeRecentWorkspaceXml(workspaceXml, input.name);
}

// ─── AI-assisted deployment ───────────────────────────────────────────────────

export async function deployBotFromAiSuggestion({
  userId,
  presetId,
  stake,
  martingale,
  takeProfit = 0,
  stopLoss = 0,
  maxRuns,
}: {
  martingale: number;
  maxRuns?: number;
  presetId: string;
  stake: number;
  stopLoss?: number;
  takeProfit?: number;
  userId: string;
}): Promise<void> {
  const asset = TRADING_BOT_ASSETS.find((a) => a.id === presetId);
  if (!asset) {
    throw new Error(`Bot preset "${presetId}" is not registered in the trading bot library.`);
  }

  const xml = await fetchBotXmlFromDatabase(presetId);

  await importBotXmlIntoBuilderMemory(
    userId,
    { name: asset.name, presetId, xml },
    {
      stake,
      martingale,
      takeProfit: Math.max(0, takeProfit) || 0,
      stopLoss: Math.abs(stopLoss) || 0,
    },
  );

  const baseSettings = extractSettingsFromXmlText(xml);
  if (!baseSettings) throw new Error("Could not parse bot XML settings.");

  const baseMaxStake = baseSettings.maxStake;
  const overridden = normalizeBotBuilderSettings({
    ...baseSettings,
    martingale,
    maxRuns: maxRuns && maxRuns > 0 ? Math.floor(maxRuns) : baseSettings.maxRuns,
    maxStake: Math.max(baseMaxStake, stake * Math.max(1, martingale) * 8),
    stake,
    stopLoss: Math.abs(stopLoss) || 0,
    takeProfit: Math.max(0, takeProfit) || 0,
  });

  persistCurrentBotSettings(userId, overridden, { presetId });

  window.dispatchEvent(
    new CustomEvent<BotDeployedEventDetail>(BOT_DEPLOYED_EVENT, {
      detail: { presetId, source: "ai-assistant" },
    }),
  );
}
