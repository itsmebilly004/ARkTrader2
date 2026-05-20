import {
  clearCurrentBotPresetId,
  persistCurrentBotPresetId,
  persistPresetWorkspaceXml,
  readPresetWorkspaceXml,
} from "@/lib/bot-builder-state";
import { writeRecentWorkspaceXml } from "@/external/bot-builder/recent-workspaces";
import { writeSavedWorkspaceXml } from "@/external/bot-builder/workspace-persistence";

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
