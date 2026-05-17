// File I/O for the Blockly bot-builder: load a strategy XML from a local file,
// save the current workspace to a local file, and reset to the default strategy.

import { saveAs } from "file-saver";
import main_xml from "@/external/bot-skeleton/scratch/xml/main.xml?raw";
import { loadWorkspaceXmlIntoBlockly, persistWorkspaceSnapshot } from "./workspace-persistence";

const isBlocklyXml = (xml: string): boolean => {
  if (!xml) return false;
  // Be liberal: accept any <xml ...> root or a <block> root (legacy partial export).
  return /<xml[\s>]/i.test(xml) || /<block[\s>]/i.test(xml);
};

const sanitizeFileName = (raw: string): string => {
  const trimmed = (raw || "").trim() || "bot-strategy";
  // Strip illegal Windows/macOS filename chars; cap length.
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
};

export type LoadResult = { ok: true; blockCount: number } | { ok: false; reason: string };

export async function loadWorkspaceFromFile(
  file: File,
  workspace: any,
  userId: string | null | undefined,
): Promise<LoadResult> {
  if (!workspace) return { ok: false, reason: "Workspace not ready." };
  const looks_like_xml =
    file.type.includes("xml") ||
    /\.xml$/i.test(file.name) ||
    file.size < 5 * 1024 * 1024;
  if (!looks_like_xml) {
    return { ok: false, reason: "Please pick a .xml file." };
  }
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bot-builder] file.text() failed", err);
    return { ok: false, reason: err instanceof Error ? err.message : "Could not read the file." };
  }
  // Strip the UTF-8 BOM if present — Blockly.utils.xml.textToDom (DOMParser
  // under the hood) accepts a BOM at byte level, but when we feed it as a
  // string DOMParser may treat the U+FEFF as the document's first character,
  // breaking XML parsing on the very first import.
  text = text.replace(/^﻿/, "").trim();
  if (!isBlocklyXml(text)) {
    // eslint-disable-next-line no-console
    console.warn("[bot-builder] file rejected by isBlocklyXml check, first 200 chars:", text.slice(0, 200));
    return { ok: false, reason: "That file isn't a Blockly strategy XML." };
  }
  const restored = loadWorkspaceXmlIntoBlockly(workspace, text);
  if (!restored) {
    return {
      ok: false,
      reason:
        "Failed to parse the strategy XML. Check the browser console for details about which block failed.",
    };
  }
  persistWorkspaceSnapshot(userId, workspace);
  const blockCount = workspace.getAllBlocks?.()?.length ?? 0;
  return { ok: true, blockCount };
}

export function saveWorkspaceToFile(workspace: any, name: string): { ok: boolean; reason?: string } {
  if (!workspace) return { ok: false, reason: "Workspace not ready." };
  try {
    const B = (window as any).Blockly;
    const xml_dom = B?.Xml?.workspaceToDom?.(workspace);
    if (!xml_dom) return { ok: false, reason: "Blockly not initialised." };
    let xml_text: string = B.Xml.domToText(xml_dom);
    // Prepend the XML declaration if missing, and add collection metadata so the
    // file round-trips with the reference's loader.
    if (!/^\s*<\?xml/i.test(xml_text)) {
      xml_text = `<?xml version="1.0" encoding="UTF-8"?>\n${xml_text}`;
    }
    const filename = `${sanitizeFileName(name)}.xml`;
    const blob = new Blob([xml_text], { type: "application/xml;charset=utf-8" });
    saveAs(blob, filename);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Save failed." };
  }
}

export function resetWorkspaceToDefault(
  workspace: any,
  userId: string | null | undefined,
): boolean {
  if (!workspace) return false;
  const restored = loadWorkspaceXmlIntoBlockly(workspace, main_xml);
  if (restored) {
    persistWorkspaceSnapshot(userId, workspace);
  }
  return restored;
}
