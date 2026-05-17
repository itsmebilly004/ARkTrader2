import {
  initialBotBuilderSettings,
  persistCurrentBotSettings,
  readCurrentBotSettings,
  type BotBuilderDurationUnit,
  type BotBuilderDigitContract,
  type BotBuilderSettings,
  type BotBuilderTradeType,
} from "@/lib/bot-builder-state";
import {
  getBlocklyRuntime,
  type BlocklyBlockLike,
  type BlocklyWorkspaceLike,
} from "./blockly-runtime";
import { scheduleRecentWorkspaceWrite } from "./recent-workspaces";

const xmlStorageKey = (userId: string | null | undefined) =>
  `arktrader:bot-builder:${userId ?? "guest"}:workspace-xml`;

export function readSavedWorkspaceXml(userId: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(xmlStorageKey(userId));
  } catch {
    return null;
  }
}

export function writeSavedWorkspaceXml(userId: string | null | undefined, xml: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(xmlStorageKey(userId), xml);
  } catch {
    // ignore quota errors
  }
}

function mapTradeType(value: string): BotBuilderTradeType {
  const v = value.toLowerCase();
  if (v.includes("digit") || v === "matchesdiffers" || v === "evenodd" || v === "overunder") {
    return "digits";
  }
  if (v === "callput" || v === "risefall" || v === "rise_fall" || v === "fall") return "rise_fall";
  if (v === "higherlower" || v === "higher_lower" || v === "higher") return "higher_lower";
  if (v === "touchnotouch" || v === "touch_no_touch" || v === "touch") return "touch_no_touch";
  if (v === "multiplier" || v.startsWith("mult")) return "multiplier";
  return initialBotBuilderSettings.tradeType;
}

function mapDigitContract(value: string): BotBuilderDigitContract {
  const v = value.toLowerCase();
  if (v.includes("matches") || v.includes("diff")) return "matches_differs";
  if (v.includes("even") || v.includes("odd")) return "even_odd";
  return "over_under";
}

function mapDirection(tradeType: string, contractType: string): string {
  const t = String(tradeType ?? "").toLowerCase();
  const c = String(contractType ?? "").toLowerCase();
  if (c === "both" || !c) {
    if (t.includes("evenodd")) return "even";
    if (t.includes("matchesdiffers")) return "matches";
    if (t.includes("overunder")) return "over";
    if (t === "callput" || t.includes("rise") || t.includes("fall")) return "up";
    if (t.includes("higher") || t.includes("lower")) return "higher";
    if (t.includes("touch")) return "touch";
    return initialBotBuilderSettings.purchaseDirection;
  }
  if (c === "call" || c === "callput_up" || c === "rise") return "up";
  if (c === "put" || c === "callput_down" || c === "fall") return "down";
  if (c === "digiteven") return "even";
  if (c === "digitodd") return "odd";
  if (c === "digitmatch") return "matches";
  if (c === "digitdiff") return "differs";
  if (c === "digitover") return "over";
  if (c === "digitunder") return "under";
  if (c === "higher" || c === "callspread") return "higher";
  if (c === "lower" || c === "putspread") return "lower";
  if (c === "onetouch") return "touch";
  if (c === "notouch") return "no_touch";
  return c;
}

function mapDurationUnit(value: string): BotBuilderDurationUnit {
  const v = String(value ?? "").toLowerCase();
  if (v === "m" || v === "minutes" || v === "minute") return "m";
  if (v === "s" || v === "seconds" || v === "second") return "s";
  return "t";
}

function readFirstNumber(...candidates: unknown[]): number | null {
  for (const value of candidates) {
    if (value === null || value === undefined) continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Recursively evaluate a value-input block tree into a numeric literal. Handles
// the most common shapes a Deriv bot uses for AMOUNT / DURATION:
//   * math_number  (a literal `1`)
//   * math_arithmetic (ADD/MINUS/MULTIPLY/DIVIDE/POWER over two children)
//   * variables_get   (follow back to a matching variables_set and recurse)
// Anything more exotic returns null so the caller can fall back to a default.
// `forbidden` blocks variables_get from resolving a variable whose ID or name
// is in the set — this prevents self-referential assignments like
// `Stake = Stake * 1.95` from being evaluated as an initial value.
function evaluateMathBlock(
  block: BlocklyBlockLike | null | undefined,
  workspace: BlocklyWorkspaceLike,
  visited: Set<string>,
  forbidden?: Set<string>,
): number | null {
  if (!block || !block.type) return null;
  const id = block.id ?? `${block.type}-${Math.random()}`;
  if (visited.has(id)) return null;
  visited.add(id);

  if (block.type === "math_number" || block.type === "math_number_positive") {
    return readFirstNumber(block.getFieldValue?.("NUM"));
  }

  if (block.type === "math_arithmetic") {
    const op = block.getFieldValue?.("OP");
    const a = evaluateMathBlock(block.getInputTargetBlock?.("A"), workspace, visited, forbidden);
    const b = evaluateMathBlock(block.getInputTargetBlock?.("B"), workspace, visited, forbidden);
    if (a === null || b === null) return null;
    switch (op) {
      case "ADD":
        return a + b;
      case "MINUS":
        return a - b;
      case "MULTIPLY":
        return a * b;
      case "DIVIDE":
        return b === 0 ? null : a / b;
      case "POWER":
        return Math.pow(a, b);
      default:
        return null;
    }
  }

  if (block.type === "math_single") {
    const op = block.getFieldValue?.("OP");
    const num = evaluateMathBlock(block.getInputTargetBlock?.("NUM"), workspace, visited, forbidden);
    if (num === null) return null;
    switch (op) {
      case "ROOT":
        return Math.sqrt(num);
      case "ABS":
        return Math.abs(num);
      case "NEG":
        return -num;
      case "LN":
        return Math.log(num);
      case "LOG10":
        return Math.log10(num);
      case "EXP":
        return Math.exp(num);
      case "POW10":
        return Math.pow(10, num);
      default:
        return null;
    }
  }

  if (block.type === "variables_get") {
    const var_id = block.getFieldValue?.("VAR");
    if (!var_id) return null;
    // Self-reference guard: skip if this variable is forbidden (being resolved up the call stack)
    if (forbidden?.has(var_id)) return null;
    if (!workspace?.getAllBlocks) return null;
    const all = workspace.getAllBlocks(true);
    for (const candidate of all) {
      if (candidate?.type !== "variables_set") continue;
      const candidate_var = candidate.getFieldValue?.("VAR");
      if (candidate_var !== var_id) continue;
      const valueBlock = candidate.getInputTargetBlock?.("VALUE");
      const evaluated = evaluateMathBlock(valueBlock, workspace, visited, forbidden);
      if (evaluated !== null) return evaluated;
    }
    return null;
  }

  return null;
}

function readNumberInput(
  block: BlocklyBlockLike | null | undefined,
  inputName: string,
  workspace: BlocklyWorkspaceLike,
): number | null {
  if (!block?.getInputTargetBlock) return null;
  const target = block.getInputTargetBlock(inputName);
  if (!target) return null;
  // Fast path: literal math_number shadow.
  const literal = readFirstNumber(target.getFieldValue?.("NUM"));
  if (literal !== null) return literal;
  // Slow path: walk through math/variables blocks (no forbidden — trade options inputs are not self-referential).
  return evaluateMathBlock(target, workspace, new Set());
}

function normalizeVariableName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getVariableNameFromBlock(block: BlocklyBlockLike): string {
  const field = block?.getField?.("VAR");
  const text = field?.getText?.();
  if (typeof text === "string" && text.trim()) return text.trim();
  const value = block?.getFieldValue?.("VAR");
  return typeof value === "string" ? value.trim() : "";
}

function readNamedVariableNumber(workspace: BlocklyWorkspaceLike, names: string[]): number | null {
  if (!workspace?.getAllBlocks) return null;
  const wanted = new Set(names.map(normalizeVariableName));
  const blocks = workspace.getAllBlocks(true);
  for (const block of blocks) {
    if (block?.type !== "variables_set") continue;
    const variableName = normalizeVariableName(getVariableNameFromBlock(block));
    if (!wanted.has(variableName)) continue;
    const varId = block.getFieldValue?.("VAR") ?? "";
    const varName = getVariableNameFromBlock(block);
    // Build forbidden set: prevents variables_get(X) inside variables_set(X) value from
    // creating a false reading (e.g. martingale block "Stake = Stake * 1.95" returning 1.95
    // instead of being skipped so we read the initial "Stake = 1.0" block instead).
    const forbidden = new Set<string>([varId, varName].filter(Boolean));
    const valueBlock = block.getInputTargetBlock?.("VALUE");
    const value = evaluateMathBlock(valueBlock, workspace, new Set(), forbidden);
    if (value !== null) return value;
  }
  return null;
}

export function extractSettingsFromWorkspace(
  workspace: BlocklyWorkspaceLike | null | undefined,
  baseOverride?: BotBuilderSettings,
): BotBuilderSettings {
  // Use the previously-persisted settings as the base so workspace edits don't
  // silently reset run-loop fields (maxRuns, takeProfit, stopLoss, martingale,
  // maxStake) back to initial defaults. Workspace blocks only carry the trade
  // definition; the run-loop knobs are managed outside Blockly and live on
  // current-settings, so we preserve them across extractions.
  const base = { ...(baseOverride ?? initialBotBuilderSettings) };
  if (!workspace?.getAllBlocks) return base;

  const blocks = workspace.getAllBlocks(true);
  const find = (type: string) => blocks.find((b) => b.type === type) ?? null;

  const market = find("trade_definition_market");
  const tradetype = find("trade_definition_tradetype");
  const contracttype = find("trade_definition_contracttype");
  const options = find("trade_definition_tradeoptions");
  const candle = find("trade_definition_candleinterval");
  const purchase = find("purchase");

  const symbol = market?.getFieldValue?.("SYMBOL_LIST") || "";
  const market_value = market?.getFieldValue?.("MARKET_LIST") || "";
  const trade_type = tradetype?.getFieldValue?.("TRADETYPE_LIST") || "";
  const contract_type = contracttype?.getFieldValue?.("TYPE_LIST") || "";
  const purchase_type = purchase?.getFieldValue?.("PURCHASE_LIST") || "";
  const duration_unit = options?.getFieldValue?.("DURATIONTYPE_LIST") || "";
  const currency = options?.getFieldValue?.("CURRENCY_LIST") || "";
  const candle_interval = candle?.getFieldValue?.("CANDLEINTERVAL_LIST") || "";

  const stake = readNumberInput(options, "AMOUNT", workspace);
  const duration = readNumberInput(options, "DURATION", workspace);
  const prediction = readNumberInput(options, "PREDICTION", workspace);
  const takeProfit = readNamedVariableNumber(workspace, [
    "take profit",
    "target profit",
    "expected profit",
    "profit",
  ]);
  const stopLoss = readNamedVariableNumber(workspace, ["stop loss", "stoploss"]);
  const martingale = readNamedVariableNumber(workspace, [
    "martingale",
    "martigale",
    "martigale factor",
  ]);
  const selectedDigit =
    prediction ??
    readNamedVariableNumber(workspace, ["prediction", "entry point", "entrypoint"]) ??
    base.selectedDigit;
  const resolvedStake =
    stake ??
    readNamedVariableNumber(workspace, ["initial stake", "initial amount", "stake", "amount"]) ??
    base.stake;
  const resolvedMartingale = martingale ?? base.martingale;

  return {
    ...base,
    symbol: symbol || base.symbol,
    market: market_value || base.market,
    tradeType: trade_type ? mapTradeType(trade_type) : base.tradeType,
    digitContract: trade_type ? mapDigitContract(trade_type) : base.digitContract,
    purchaseDirection:
      trade_type || contract_type || purchase_type
        ? mapDirection(trade_type, purchase_type || contract_type)
        : base.purchaseDirection,
    durationUnit: duration_unit ? mapDurationUnit(duration_unit) : base.durationUnit,
    duration: duration ?? base.duration,
    martingale: resolvedMartingale,
    maxStake: Math.max(base.maxStake, resolvedStake * Math.max(1, resolvedMartingale) * 8),
    selectedDigit,
    stake: resolvedStake,
    stopLoss: stopLoss ?? base.stopLoss,
    takeProfit: takeProfit ?? base.takeProfit,
    currency: currency || base.currency,
    candleInterval: candle_interval || base.candleInterval,
  };
}

function parseBlocklyXml(xmlText: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    return doc;
  } catch {
    return null;
  }
}

function childElement(
  parent: Element | null | undefined,
  tagName: string,
  name?: string,
): Element | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.tagName.toLowerCase() !== tagName.toLowerCase()) continue;
    if (name && child.getAttribute("name") !== name) continue;
    return child;
  }
  return null;
}

function childBlock(parent: Element | null | undefined): Element | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "block" || tag === "shadow") return child;
  }
  return null;
}

function xmlField(block: Element | null | undefined, name: string): string {
  return childElement(block, "field", name)?.textContent?.trim() ?? "";
}

function xmlFieldElement(block: Element | null | undefined, name: string): Element | null {
  return childElement(block, "field", name);
}

function xmlValueBlock(block: Element | null | undefined, name: string): Element | null {
  return childBlock(childElement(block, "value", name));
}

function xmlBlocks(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagName("block"));
}

function firstXmlBlock(doc: Document, type: string): Element | null {
  return xmlBlocks(doc).find((block) => block.getAttribute("type") === type) ?? null;
}

function readXmlVariableField(block: Element | null | undefined) {
  const field = xmlFieldElement(block, "VAR");
  return {
    id: field?.getAttribute("id") ?? "",
    name: field?.textContent?.trim() ?? "",
  };
}

function xmlVariableMatches(candidate: Element, variableId: string, variableName: string): boolean {
  const candidateVariable = readXmlVariableField(candidate);
  if (variableId && candidateVariable.id === variableId) return true;
  return (
    !!variableName &&
    normalizeVariableName(candidateVariable.name) === normalizeVariableName(variableName)
  );
}

function evaluateXmlMathBlock(
  block: Element | null,
  variableSets: Element[],
  visited: Set<Element>,
  forbidden?: Set<string>,
): number | null {
  if (!block) return null;
  if (visited.has(block)) return null;
  visited.add(block);

  const type = block.getAttribute("type") ?? "";
  if (type === "math_number" || type === "math_number_positive") {
    return readFirstNumber(xmlField(block, "NUM"));
  }

  if (type === "math_arithmetic") {
    const op = xmlField(block, "OP");
    const a = evaluateXmlMathBlock(xmlValueBlock(block, "A"), variableSets, visited, forbidden);
    const b = evaluateXmlMathBlock(xmlValueBlock(block, "B"), variableSets, visited, forbidden);
    if (a === null || b === null) return null;
    switch (op) {
      case "ADD":
        return a + b;
      case "MINUS":
        return a - b;
      case "MULTIPLY":
        return a * b;
      case "DIVIDE":
        return b === 0 ? null : a / b;
      case "POWER":
        return Math.pow(a, b);
      default:
        return null;
    }
  }

  if (type === "math_single") {
    const op = xmlField(block, "OP");
    const num = evaluateXmlMathBlock(xmlValueBlock(block, "NUM"), variableSets, visited, forbidden);
    if (num === null) return null;
    switch (op) {
      case "ROOT":
        return Math.sqrt(num);
      case "ABS":
        return Math.abs(num);
      case "NEG":
        return -num;
      case "LN":
        return Math.log(num);
      case "LOG10":
        return Math.log10(num);
      case "EXP":
        return Math.exp(num);
      case "POW10":
        return Math.pow(10, num);
      default:
        return null;
    }
  }

  if (type === "variables_get") {
    const variable = readXmlVariableField(block);
    // Self-reference guard: skip if this variable ID or name is forbidden
    if (forbidden?.has(variable.id) || forbidden?.has(variable.name)) return null;
    for (const candidate of variableSets) {
      if (!xmlVariableMatches(candidate, variable.id, variable.name)) continue;
      const value = evaluateXmlMathBlock(xmlValueBlock(candidate, "VALUE"), variableSets, visited, forbidden);
      if (value !== null) return value;
    }
  }

  return null;
}

function readXmlNumberInput(
  block: Element | null,
  inputName: string,
  variableSets: Element[],
): number | null {
  const target = xmlValueBlock(block, inputName);
  return evaluateXmlMathBlock(target, variableSets, new Set());
}

function readXmlNamedVariableNumber(variableSets: Element[], names: string[]): number | null {
  const wanted = new Set(names.map(normalizeVariableName));
  for (const block of variableSets) {
    const varField = readXmlVariableField(block);
    const variable = normalizeVariableName(varField.name);
    if (!wanted.has(variable)) continue;
    // Forbidden set prevents self-referential assignments (e.g. Stake = Stake * 1.95) from
    // being evaluated as an initial value; instead we skip to the next setter block.
    const forbidden = new Set<string>([varField.id, varField.name].filter(Boolean));
    const value = evaluateXmlMathBlock(xmlValueBlock(block, "VALUE"), variableSets, new Set(), forbidden);
    if (value !== null) return value;
  }
  return null;
}

export function extractSettingsFromXmlText(
  xmlText: string,
  baseOverride?: BotBuilderSettings,
): BotBuilderSettings | null {
  const doc = parseBlocklyXml(xmlText);
  if (!doc) return null;
  const base = { ...(baseOverride ?? initialBotBuilderSettings) };
  const variableSets = xmlBlocks(doc).filter(
    (block) => block.getAttribute("type") === "variables_set",
  );

  const market = firstXmlBlock(doc, "trade_definition_market");
  const tradetype = firstXmlBlock(doc, "trade_definition_tradetype");
  const contracttype = firstXmlBlock(doc, "trade_definition_contracttype");
  const options = firstXmlBlock(doc, "trade_definition_tradeoptions");
  const candle = firstXmlBlock(doc, "trade_definition_candleinterval");
  const purchase = firstXmlBlock(doc, "purchase");

  const symbol = xmlField(market, "SYMBOL_LIST");
  const marketValue = xmlField(market, "MARKET_LIST");
  const tradeType = xmlField(tradetype, "TRADETYPE_LIST");
  const contractType = xmlField(contracttype, "TYPE_LIST");
  const purchaseType = xmlField(purchase, "PURCHASE_LIST");
  const durationUnit = xmlField(options, "DURATIONTYPE_LIST");
  const currency = xmlField(options, "CURRENCY_LIST");
  const candleInterval = xmlField(candle, "CANDLEINTERVAL_LIST");

  const stake = readXmlNumberInput(options, "AMOUNT", variableSets);
  const duration = readXmlNumberInput(options, "DURATION", variableSets);
  const prediction = readXmlNumberInput(options, "PREDICTION", variableSets);
  const takeProfit = readXmlNamedVariableNumber(variableSets, [
    "take profit",
    "target profit",
    "expected profit",
    "profit",
  ]);
  const stopLoss = readXmlNamedVariableNumber(variableSets, ["stop loss", "stoploss"]);
  const martingale = readXmlNamedVariableNumber(variableSets, [
    "martingale",
    "martigale",
    "martigale factor",
  ]);
  const selectedDigit =
    prediction ??
    readXmlNamedVariableNumber(variableSets, ["prediction", "entry point", "entrypoint"]) ??
    base.selectedDigit;
  const resolvedStake =
    stake ??
    readXmlNamedVariableNumber(variableSets, [
      "initial stake",
      "initial amount",
      "stake",
      "amount",
    ]) ??
    base.stake;
  const resolvedMartingale = martingale ?? base.martingale;

  return {
    ...base,
    symbol: symbol || base.symbol,
    market: marketValue || base.market,
    tradeType: tradeType ? mapTradeType(tradeType) : base.tradeType,
    digitContract: tradeType ? mapDigitContract(tradeType) : base.digitContract,
    purchaseDirection:
      tradeType || contractType || purchaseType
        ? mapDirection(tradeType, purchaseType || contractType)
        : base.purchaseDirection,
    durationUnit: durationUnit ? mapDurationUnit(durationUnit) : base.durationUnit,
    duration: duration ?? base.duration,
    martingale: resolvedMartingale,
    maxStake: Math.max(base.maxStake, resolvedStake * Math.max(1, resolvedMartingale) * 8),
    selectedDigit,
    stake: resolvedStake,
    stopLoss: stopLoss ?? base.stopLoss,
    takeProfit: takeProfit ?? base.takeProfit,
    currency: currency || base.currency,
    candleInterval: candleInterval || base.candleInterval,
  };
}

export function persistWorkspaceSnapshot(
  userId: string | null | undefined,
  workspace: BlocklyWorkspaceLike | null | undefined,
  options?: { name?: string },
) {
  if (!workspace) return;
  try {
    const B = getBlocklyRuntime();
    if (B?.Xml?.workspaceToDom && B.Xml.domToText && workspace.getAllBlocks?.()?.length) {
      const xml_dom = B.Xml.workspaceToDom(workspace);
      const xml_text = B.Xml.domToText(xml_dom);
      writeSavedWorkspaceXml(userId, xml_text);
      // ALSO write to the localForage key dbot.initWorkspace reads from on
      // every mount. This is the canonical restore path — by writing here,
      // refresh / re-open of /bot-builder picks up the user's last bot
      // automatically without any post-init React work.
      scheduleRecentWorkspaceWrite(workspace, options?.name ?? "My bot strategy");
    }
  } catch (err) {
    console.warn("[bot-builder] failed to persist workspace xml", err);
  }
  try {
    // Seed extraction with the builder memory so run-loop knobs survive
    // workspace edits instead of snapping back to the initial defaults.
    const existing = readCurrentBotSettings(userId) ?? undefined;
    const settings = extractSettingsFromWorkspace(workspace, existing);
    persistCurrentBotSettings(userId, settings);
  } catch (err) {
    console.warn("[bot-builder] failed to persist derived settings", err);
  }
}

/**
 * Load a Blockly strategy XML into the workspace. Disposes every existing
 * top-level block (including deletable=false root blocks), groups events so
 * listeners see one transaction, then rerenders + recenters.
 *
 * Returns true if domToWorkspace completed without throwing.
 */
export function loadWorkspaceXmlIntoBlockly(
  workspace: BlocklyWorkspaceLike | null | undefined,
  xml_text: string | null,
): boolean {
  if (!workspace || !xml_text) return false;
  const B = getBlocklyRuntime();
  if (!B?.Xml || !B?.utils?.xml?.textToDom) return false;

  const previous_group = B.Events?.getGroup?.();
  try {
    const dom = B.utils.xml.textToDom(xml_text);

    // Group teardown + rebuild as one transaction. We intentionally do NOT
    // disable events (that suppresses BLOCK_CREATE and stops Blockly's
    // renderer from drawing new blocks until the next page refresh).
    B.Events?.setGroup?.(`dbot-load${Date.now()}`);

    // 1) Force every top block deletable so clearWorkspaceAndLoadFromXml can
    //    actually dispose them. Older saves stored deletable=false on the
    //    root block which would otherwise leave the previous strategy stuck.
    const top_blocks_before = workspace.getTopBlocks?.(false) ?? [];
    for (const block of top_blocks_before) {
      try {
        if (block && "deletable_" in block) block.deletable_ = true;
        block.setDeletable?.(true);
      } catch {
        /* noop */
      }
    }

    // 2) Use Blockly's canonical "wipe + load" helper. This is one atomic
    //    operation that clears variables + top blocks AND renders the new
    //    DOM into the same workspace — no race, no leftover blocks.
    if (typeof B.Xml.clearWorkspaceAndLoadFromXml === "function") {
      B.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
    } else if (B.Xml.domToWorkspace) {
      // Fallback for older Blockly builds.
      workspace.clear?.();
      B.Xml.domToWorkspace(dom, workspace);
    } else {
      return false;
    }

    workspace.clearUndo?.();
    B.Events?.setGroup?.(previous_group ?? false);

    const new_top = workspace.getTopBlocks?.(false) ?? [];

    // 3) Explicitly render every top block. clearWorkspaceAndLoadFromXml
    //    creates the SVG nodes but the v10 Zelos renderer sometimes needs a
    //    second pass after the workspace's metrics settle.
    for (const block of new_top) {
      try {
        block.initSvg?.();
        block.render?.(false);
      } catch {
        /* noop */
      }
    }

    // 4) Recompute Blockly's metrics, scroll to home, kick a resize so the
    //    surrounding React layout updates too. rAF defers the render-batch
    //    pass until after the DOM commit so the user sees blocks immediately.
    const flush = () => {
      try {
        B.svgResize?.(workspace);
      } catch {
        /* noop */
      }
      try {
        workspace.render?.();
      } catch {
        /* noop */
      }
      try {
        workspace.scrollCenter?.();
      } catch {
        /* noop */
      }
      try {
        window.dispatchEvent(new Event("resize"));
      } catch {
        /* noop */
      }
    };
    flush();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(flush);
    }

    const block_count = workspace.getAllBlocks?.(false)?.length ?? 0;
    console.info(
      "[bot-builder] loaded workspace, block_count =",
      block_count,
      "top_blocks =",
      new_top.length,
    );
    return block_count > 0;
  } catch (err) {
    console.error("[bot-builder] failed to load workspace xml", err);
    try {
      B.Events?.setGroup?.(previous_group ?? false);
    } catch {
      /* noop */
    }
    return false;
  }
}
