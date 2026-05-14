export type MarketMemoryScope = "analysis" | "bot-builder" | "charts" | "manual";

export type ActivityEntry = {
  id: string;
  message: string;
  meta?: Record<string, string | number | boolean | null>;
  time: string;
  type:
    | "assistant"
    | "bot-monitor"
    | "market"
    | "preset"
    | "system"
    | "trade";
};

export type TrackedTradeMemory = {
  closedAt?: string | null;
  contractId: string;
  contractType: string;
  currency: string;
  id: string;
  market: string;
  openedAt: string;
  payout: number | null;
  profitLoss: number | null;
  source: "accumulator" | "bot-builder" | "bot-footer" | "manual";
  stake: number;
  status: "lost" | "open" | "sold" | "won";
};

export type BotMonitorMemorySnapshot = {
  journal: Array<{
    id: string;
    message: string;
    time: string;
    type: "error" | "info" | "success" | "warning";
  }>;
  stats: {
    contractsLost: number;
    contractsWon: number;
    runs: number;
    totalPayout: number;
    totalProfitLoss: number;
    totalStake: number;
  };
  status: "error" | "running" | "stopped";
  transactions: Array<{
    contractId: string;
    id: string;
    payout: number;
    profit: number;
    stake: number;
    status: "lost" | "open" | "won";
    time: string;
  }>;
  updatedAt: string;
};

type ActivityMemoryState = {
  activities: ActivityEntry[];
  assistantButton: { x: number; y: number } | null;
  botMonitor: BotMonitorMemorySnapshot | null;
  markets: Partial<Record<MarketMemoryScope | "current", string>>;
  trades: TrackedTradeMemory[];
  version: 1;
};

const MEMORY_VERSION = 1;

function storageKey(userId?: string | null) {
  return `arktrader:activity-memory:${userId ?? "guest"}`;
}

function createEmptyMemory(): ActivityMemoryState {
  return {
    activities: [],
    assistantButton: null,
    botMonitor: null,
    markets: {},
    trades: [],
    version: MEMORY_VERSION,
  };
}

export function readActivityMemory(userId?: string | null): ActivityMemoryState {
  if (typeof window === "undefined") return createEmptyMemory();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return createEmptyMemory();
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== MEMORY_VERSION) return createEmptyMemory();
    return {
      activities: Array.isArray(parsed.activities)
        ? parsed.activities.filter(isActivityEntry).slice(0, 120)
        : [],
      assistantButton: isPositionRecord(parsed.assistantButton) ? parsed.assistantButton : null,
      botMonitor: isBotMonitorSnapshot(parsed.botMonitor) ? parsed.botMonitor : null,
      markets: isRecord(parsed.markets)
        ? Object.fromEntries(
            Object.entries(parsed.markets).filter(
              ([key, value]) =>
                (key === "current" ||
                  key === "manual" ||
                  key === "charts" ||
                  key === "analysis" ||
                  key === "bot-builder") &&
                typeof value === "string" &&
                value.trim().length > 0,
            ),
          )
        : {},
      trades: Array.isArray(parsed.trades)
        ? parsed.trades.filter(isTrackedTradeMemory).slice(0, 120)
        : [],
      version: MEMORY_VERSION,
    };
  } catch {
    return createEmptyMemory();
  }
}

export function readRememberedMarket(
  userId: string | null | undefined,
  scope: MarketMemoryScope,
  fallback?: string,
) {
  const memory = readActivityMemory(userId);
  return memory.markets[scope] ?? memory.markets.current ?? fallback ?? null;
}

export function rememberMarketSelection(
  userId: string | null | undefined,
  scope: MarketMemoryScope,
  symbol: string,
) {
  const trimmed = symbol.trim();
  if (!trimmed) return;
  updateActivityMemory(userId, (memory) => {
    if (memory.markets.current === trimmed && memory.markets[scope] === trimmed) {
      return memory;
    }
    memory.markets.current = trimmed;
    memory.markets[scope] = trimmed;
    pushActivity(memory, {
      id: crypto.randomUUID(),
      message: `Selected ${trimmed} on ${scope}.`,
      meta: { scope, symbol: trimmed },
      time: new Date().toISOString(),
      type: "market",
    });
    return memory;
  });
}

export function recordActivity(
  userId: string | null | undefined,
  entry: Omit<ActivityEntry, "id" | "time"> & Partial<Pick<ActivityEntry, "id" | "time">>,
) {
  updateActivityMemory(userId, (memory) => {
    pushActivity(memory, {
      id: entry.id ?? crypto.randomUUID(),
      message: entry.message,
      meta: entry.meta,
      time: entry.time ?? new Date().toISOString(),
      type: entry.type,
    });
    return memory;
  });
}

export function recordBotPresetActivity(
  userId: string | null | undefined,
  action: "deleted" | "deployed" | "imported" | "loaded" | "saved",
  presetName: string,
  presetId?: string,
) {
  recordActivity(userId, {
    message: `${action[0].toUpperCase()}${action.slice(1)} bot preset: ${presetName}.`,
    meta: { action, presetId: presetId ?? null, presetName },
    type: "preset",
  });
}

export function readTrackedTrades(userId?: string | null) {
  return readActivityMemory(userId).trades;
}

export function upsertTrackedTrade(
  userId: string | null | undefined,
  trade: TrackedTradeMemory,
) {
  updateActivityMemory(userId, (memory) => {
    const nextTrades = memory.trades.filter(
      (item) => item.contractId !== trade.contractId && item.id !== trade.id,
    );
    nextTrades.unshift(trade);
    memory.trades = nextTrades.slice(0, 120);
    pushActivity(memory, {
      id: crypto.randomUUID(),
      message: `Tracked ${trade.source} trade on ${trade.market} (${trade.contractType}).`,
      meta: {
        contractId: trade.contractId,
        market: trade.market,
        source: trade.source,
        status: trade.status,
      },
      time: new Date().toISOString(),
      type: "trade",
    });
    return memory;
  });
}

export function updateTrackedTrade(
  userId: string | null | undefined,
  contractId: string,
  patch: Partial<TrackedTradeMemory>,
) {
  if (!contractId) return;
  updateActivityMemory(userId, (memory) => {
    memory.trades = memory.trades.map((trade) =>
      trade.contractId === contractId ? { ...trade, ...patch } : trade,
    );
    const updated = memory.trades.find((trade) => trade.contractId === contractId);
    if (updated && patch.status && patch.status !== "open") {
      pushActivity(memory, {
        id: crypto.randomUUID(),
        message: `Closed ${updated.source} trade ${contractId} as ${patch.status}.`,
        meta: {
          contractId,
          profitLoss: patch.profitLoss ?? updated.profitLoss ?? null,
          status: patch.status,
        },
        time: new Date().toISOString(),
        type: "trade",
      });
    }
    return memory;
  });
}

export function readBotMonitorSnapshot(userId?: string | null) {
  return readActivityMemory(userId).botMonitor;
}

export function persistBotMonitorSnapshot(
  userId: string | null | undefined,
  snapshot: BotMonitorMemorySnapshot,
) {
  updateActivityMemory(userId, (memory) => {
    memory.botMonitor = {
      journal: snapshot.journal.slice(0, 60),
      stats: snapshot.stats,
      status: snapshot.status,
      transactions: snapshot.transactions.slice(0, 60),
      updatedAt: snapshot.updatedAt,
    };
    return memory;
  });
}

export function readAssistantButtonPosition(userId?: string | null) {
  return readActivityMemory(userId).assistantButton;
}

export function persistAssistantButtonPosition(
  userId: string | null | undefined,
  position: { x: number; y: number },
) {
  updateActivityMemory(userId, (memory) => {
    memory.assistantButton = {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
    };
    return memory;
  });
}

function updateActivityMemory(
  userId: string | null | undefined,
  updater: (memory: ActivityMemoryState) => ActivityMemoryState,
) {
  if (typeof window === "undefined") return;
  try {
    const next = updater(readActivityMemory(userId));
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* Local persistence is best effort. */
  }
}

function pushActivity(memory: ActivityMemoryState, activity: ActivityEntry) {
  memory.activities = [activity, ...memory.activities].slice(0, 120);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositionRecord(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  );
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.message === "string" &&
    typeof value.time === "string" &&
    (value.type === "assistant" ||
      value.type === "bot-monitor" ||
      value.type === "market" ||
      value.type === "preset" ||
      value.type === "system" ||
      value.type === "trade")
  );
}

function isTrackedTradeMemory(value: unknown): value is TrackedTradeMemory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.contractId === "string" &&
    typeof value.contractType === "string" &&
    typeof value.currency === "string" &&
    typeof value.market === "string" &&
    typeof value.openedAt === "string" &&
    Number.isFinite(Number(value.stake)) &&
    (value.status === "lost" ||
      value.status === "open" ||
      value.status === "sold" ||
      value.status === "won") &&
    (value.source === "accumulator" ||
      value.source === "bot-builder" ||
      value.source === "bot-footer" ||
      value.source === "manual")
  );
}

function isBotMonitorSnapshot(value: unknown): value is BotMonitorMemorySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.journal) &&
    Array.isArray(value.transactions) &&
    isRecord(value.stats) &&
    typeof value.updatedAt === "string" &&
    (value.status === "error" || value.status === "running" || value.status === "stopped")
  );
}
