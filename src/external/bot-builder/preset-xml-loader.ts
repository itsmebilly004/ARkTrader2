// Map every trading-bots preset id to the strategy XML that should be loaded
// into the Blockly workspace when the user clicks Deploy. Each XML is a copy
// of the real exported strategy from the original .xml in src/assets/ so the
// deployed workspace matches what the user gets when they upload that file
// manually.
//
// Lazy dynamic imports keep each XML in its own Vite chunk — the bot-builder
// route doesn't pay the download cost for any preset until the user actually
// picks one.

type Loader = () => Promise<string>;

const REGISTRY: Record<string, Loader> = {
  "nova-v6": () =>
    import("@/external/bot-presets-xml/nova-v6.xml?raw").then((m) => m.default),
  "mega-mind": () =>
    import("@/external/bot-presets-xml/mega-mind.xml?raw").then((m) => m.default),
  "phantom-hit-run": () =>
    import("@/external/bot-presets-xml/phantom-hit-run.xml?raw").then((m) => m.default),
  "candle-mine": () =>
    import("@/external/bot-presets-xml/candle-mine.xml?raw").then((m) => m.default),
  "dec-entry": () =>
    import("@/external/bot-presets-xml/dec-entry.xml?raw").then((m) => m.default),
  "auto-pilot-shield": () =>
    import("@/external/bot-presets-xml/auto-pilot-shield.xml?raw").then((m) => m.default),
  "under-pro-bot": () =>
    import("@/external/bot-presets-xml/under-pro-bot.xml?raw").then((m) => m.default),
};

export const hasPresetXml = (id: string | null | undefined): boolean =>
  !!id && id in REGISTRY;

export async function loadPresetXml(id: string): Promise<string | null> {
  const loader = REGISTRY[id];
  if (!loader) return null;
  try {
    return await loader();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bot-builder] failed to load preset xml for", id, err);
    return null;
  }
}

export const PRESET_IDS = Object.keys(REGISTRY);
