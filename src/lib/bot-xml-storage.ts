import { supabase } from "@/integrations/supabase/client";
import { TRADING_BOT_ASSETS, type TradingBotAsset } from "./trading-bot-database";

const assetXmlModules = import.meta.glob<string>("/src/assets/*.xml", {
  import: "default",
  query: "?raw",
});

async function loadAssetXml(asset: TradingBotAsset): Promise<string> {
  const entry = Object.entries(assetXmlModules).find(([path]) => path.includes(asset.fileMatch));
  if (!entry) throw new Error(`XML asset not found for ${asset.name}`);
  const [, loader] = entry;
  return (await loader()).replace(/^﻿/, "").trim();
}


export async function ensureBotXmlPresets(): Promise<void> {
  for (const asset of TRADING_BOT_ASSETS) {
    try {
      const xml = await loadAssetXml(asset);
      const { error } = await supabase.from("bot_xml_presets").upsert(
        { bot_id: asset.id, name: asset.name, xml_content: xml, updated_at: new Date().toISOString() },
        { onConflict: "bot_id" },
      );
      if (error) console.warn(`[bot-xml] failed to upsert ${asset.id}:`, error);
    } catch (err) {
      console.warn(`[bot-xml] skipped ${asset.id} — could not load XML:`, err);
    }
  }
}

export async function fetchBotXmlFromDatabase(botId: string): Promise<string> {
  await ensureBotXmlPresets();
  const { data, error } = await supabase
    .from("bot_xml_presets")
    .select("xml_content")
    .eq("bot_id", botId)
    .single();
  if (error || !data?.xml_content) {
    throw new Error(`Could not fetch XML for bot "${botId}" from the database.`);
  }
  return data.xml_content;
}
