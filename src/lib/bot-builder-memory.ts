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
  extractSettingsFromXmlText,
  writeSavedWorkspaceXml,
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

export async function importBotXmlIntoBuilderMemory(
  userId: string | null | undefined,
  input: BuilderMemoryImport,
): Promise<void> {
  const freshXml = normalizeXml(input.xml);
  if (!isBlocklyXml(freshXml)) {
    throw new Error("The selected bot preset is not a Blockly XML strategy.");
  }

  // If a presetId is given, check whether the user already has edits for this
  // preset saved. If so, restore those instead of wiping them with the fresh
  // deployment XML — this preserves any block-level adjustments the user made.
  let workspaceXml = freshXml;
  if (input.presetId && userId) {
    const savedUserXml = readPresetWorkspaceXml(userId, input.presetId);
    if (savedUserXml) {
      workspaceXml = savedUserXml;
    }
  }

  if (input.presetId) {
    persistCurrentBotPresetId(userId, input.presetId);
    // Also seed the preset workspace store on first deploy so autosave can
    // update it (the store may be empty if the user never deployed before).
    if (!readPresetWorkspaceXml(userId, input.presetId)) {
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
}: {
  martingale: number;
  presetId: string;
  stake: number;
  userId: string;
}): Promise<void> {
  const asset = TRADING_BOT_ASSETS.find((a) => a.id === presetId);
  if (!asset) {
    throw new Error(`Bot preset "${presetId}" is not registered in the trading bot library.`);
  }

  const xml = await fetchBotXmlFromDatabase(presetId);

  await importBotXmlIntoBuilderMemory(userId, { name: asset.name, presetId, xml });

  const baseSettings = extractSettingsFromXmlText(xml);
  if (!baseSettings) throw new Error("Could not parse bot XML settings.");

  const baseMaxStake = baseSettings.maxStake;
  const overridden = normalizeBotBuilderSettings({
    ...baseSettings,
    martingale,
    maxStake: Math.max(baseMaxStake, stake * Math.max(1, martingale) * 8),
    stake,
  });

  persistCurrentBotSettings(userId, overridden, { presetId });

  window.dispatchEvent(
    new CustomEvent<BotDeployedEventDetail>(BOT_DEPLOYED_EVENT, {
      detail: { presetId, source: "ai-assistant" },
    }),
  );
}
