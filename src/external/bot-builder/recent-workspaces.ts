import localForage from "localforage";
import LZString from "lz-string";
import { getBlocklyRuntime, type BlocklyWorkspaceLike } from "./blockly-runtime";

/**
 * Writes to the SAME localForage key (`saved_workspaces`) that dbot.initWorkspace
 * reads from on every mount. By piggybacking on dbot's own restore path we
 * avoid the race where dbot loads main.xml before our React effect has a
 * chance to override — refresh just picks up whatever was last written here.
 *
 * The on-disk format is LZ-string-compressed JSON of a `RecentWorkspace[]`
 * array, matching the reference bot's storage layout exactly.
 */

const STORAGE_KEY = "saved_workspaces";
const MAX_RECENT = 10;

export type RecentWorkspace = {
  id: string;
  name: string;
  xml: string;
  timestamp: number;
  save_type: string;
};

export async function getRecentWorkspaces(): Promise<RecentWorkspace[]> {
  try {
    const raw = await localForage.getItem<string>(STORAGE_KEY);
    if (!raw) return [];
    const decompressed = LZString.decompress(raw);
    if (!decompressed) return [];
    const parsed = JSON.parse(decompressed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Serialise the current workspace and upsert it into the recent-workspaces
 * list under the workspace's strategy id (or a fresh uid if it has none). The
 * latest entry sits at index 0 so dbot.initWorkspace loads it on next mount.
 */
export async function writeRecentWorkspace(
  workspace: BlocklyWorkspaceLike,
  name: string,
): Promise<boolean> {
  try {
    const B = getBlocklyRuntime();
    if (!B?.Xml?.workspaceToDom || !B.Xml.domToText || !workspace?.getAllBlocks?.()?.length) {
      return false;
    }
    const xml_dom = B.Xml.workspaceToDom(workspace);
    const xml_text = B.Xml.domToText(xml_dom);

    const generatedId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = workspace.current_strategy_id ?? B.utils?.idGenerator?.genUid?.() ?? generatedId;
    workspace.current_strategy_id = id;

    const list = await getRecentWorkspaces();
    const existing_idx = list.findIndex((w) => w.id === id);
    const entry: RecentWorkspace = {
      id,
      name: name || "Bot strategy",
      xml: xml_text,
      timestamp: Date.now(),
      save_type: "unsaved",
    };
    if (existing_idx >= 0) {
      list[existing_idx] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => b.timestamp - a.timestamp);
    if (list.length > MAX_RECENT) list.length = MAX_RECENT;

    await localForage.setItem(STORAGE_KEY, LZString.compress(JSON.stringify(list)));
    return true;
  } catch (err) {
    console.warn("[bot-builder] writeRecentWorkspace failed", err);
    return false;
  }
}

export async function writeRecentWorkspaceXml(xml: string, name: string): Promise<boolean> {
  try {
    if (!xml.trim()) return false;
    const generatedId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const list = await getRecentWorkspaces();
    const entry: RecentWorkspace = {
      id: generatedId,
      name: name || "Bot strategy",
      xml,
      timestamp: Date.now(),
      save_type: "unsaved",
    };
    const next = [entry, ...list.filter((item) => item.xml !== xml)].slice(0, MAX_RECENT);
    await localForage.setItem(STORAGE_KEY, LZString.compress(JSON.stringify(next)));
    return true;
  } catch (err) {
    console.warn("[bot-builder] writeRecentWorkspaceXml failed", err);
    return false;
  }
}

/**
 * Synchronous best-effort wrapper that schedules the async write without
 * blocking the caller (used inside the debounced workspace change listener).
 */
export function scheduleRecentWorkspaceWrite(workspace: BlocklyWorkspaceLike, name: string): void {
  void writeRecentWorkspace(workspace, name);
}
