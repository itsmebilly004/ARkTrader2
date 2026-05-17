import { clearCurrentBotPresetId } from "@/lib/bot-builder-state";
import { writeRecentWorkspaceXml } from "@/external/bot-builder/recent-workspaces";
import { writeSavedWorkspaceXml } from "@/external/bot-builder/workspace-persistence";

export type BuilderMemoryImport = {
  name: string;
  xml: string;
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
  const xml = normalizeXml(input.xml);
  if (!isBlocklyXml(xml)) {
    throw new Error("The selected bot preset is not a Blockly XML strategy.");
  }
  clearCurrentBotPresetId(userId);
  if (userId) clearCurrentBotPresetId(null);
  writeSavedWorkspaceXml(userId, xml);
  await writeRecentWorkspaceXml(xml, input.name);
}
