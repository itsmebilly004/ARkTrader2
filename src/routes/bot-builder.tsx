import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  LayoutList,
  LineChart,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { TopShell } from "@/components/top-shell";
import {
  BotRunMonitorPanel,
  type BotMonitorJournalEntry,
  type BotMonitorStats,
  type BotMonitorStatus,
  type BotMonitorTransaction,
} from "@/components/bot-run-monitor";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  persistBotMonitorSnapshot,
  recordBotPresetActivity,
  rememberMarketSelection,
  updateTrackedTrade,
  upsertTrackedTrade,
} from "@/lib/activity-memory";
import {
  getDerivTradingErrorMessage,
  type TradeCategory,
} from "@/lib/deriv";
import { BOT_PRESET_CONFIGS, type BotPresetConfig } from "@/lib/bot-presets";
import { buyProposal, requestProposal, subscribeOpenContract } from "@/lib/deriv-trading-service";
import { buildStandardProposalPayload, type ProposalInput } from "@/lib/trade-proposal-builder";
import { numberFrom } from "@/lib/contract-state";
import { cn } from "@/lib/utils";

const search = z.object({
  preset: z.string().optional(),
});

export const Route = createFileRoute("/bot-builder")({
  component: BotBuilderPage,
  validateSearch: search,
});

type BotStatus = BotMonitorStatus;
type DurationUnit = "m" | "s" | "t";
type TradeTypeUi = "digits" | "higher_lower" | "multiplier" | "rise_fall" | "touch_no_touch";
type DigitContract = "even_odd" | "matches_differs" | "over_under";
type BotSettings = {
  assetCategory: string;
  candleInterval: string;
  conditionJoin: "All" | "Any";
  conditionLeft: string;
  conditionOperator: string;
  conditionRight: string;
  currency: string;
  digitContract: DigitContract;
  duration: number;
  durationUnit: DurationUnit;
  market: string;
  martingale: number;
  maxRuns: number;
  maxStake: number;
  purchaseDirection: string;
  restartBuySellOnError: boolean;
  restartLastTradeOnError: boolean;
  runOnceAtStart: boolean;
  selectedDigit: number;
  stake: number;
  stopLoss: number;
  symbol: string;
  takeProfit: number;
  tradeEveryTick: boolean;
  tradeType: TradeTypeUi;
};
type BotStats = BotMonitorStats;
type Transaction = BotMonitorTransaction;
type JournalEntry = BotMonitorJournalEntry;
type Settlement = {
  entrySpot: number | null;
  exitSpot: number | null;
  payout: number;
  profit: number;
  status: "lost" | "open" | "won";
};
type SavedBotPreset = {
  id: string;
  name: string;
  savedAt: string;
  settings: BotSettings;
  source: "deployed" | "imported" | "manual";
};
type ImportedBotSettings = {
  name: string;
  settings: BotSettings;
};

const CURRENT_SETTINGS_STORAGE_VERSION = 1;
const SAVED_PRESETS_STORAGE_VERSION = 1;

const symbolOptions = [
  { label: "Volatility 10 Index", value: "R_10" },
  { label: "Volatility 25 Index", value: "R_25" },
  { label: "Volatility 50 Index", value: "R_50" },
  { label: "Volatility 75 Index", value: "R_75" },
  { label: "Volatility 100 Index", value: "R_100" },
  { label: "Volatility 10 (1s) Index", value: "1HZ10V" },
  { label: "Volatility 25 (1s) Index", value: "1HZ25V" },
  { label: "Volatility 50 (1s) Index", value: "1HZ50V" },
  { label: "Volatility 75 (1s) Index", value: "1HZ75V" },
  { label: "Volatility 100 (1s) Index", value: "1HZ100V" },
];

const initialSettings: BotSettings = {
  assetCategory: "Continuous Indices",
  candleInterval: "1 minute",
  conditionJoin: "All",
  conditionLeft: "Last Digit",
  conditionOperator: ">",
  conditionRight: "3",
  currency: "USD",
  digitContract: "over_under",
  duration: 1,
  durationUnit: "t",
  market: "Derived",
  martingale: 1.5,
  maxRuns: 1,
  maxStake: 500,
  purchaseDirection: "over",
  restartBuySellOnError: true,
  restartLastTradeOnError: true,
  runOnceAtStart: true,
  selectedDigit: 4,
  stake: 1,
  stopLoss: 30,
  symbol: "R_10",
  takeProfit: 100,
  tradeEveryTick: false,
  tradeType: "digits",
};

const blockMenu = [
  { section: "trade", title: "Trade parameters" },
  { section: "purchase", title: "Purchase conditions" },
  { section: "sell", title: "Sell conditions (optional)" },
  { section: "restart", title: "Restart trading conditions" },
  { collapsible: true, section: "analysis", title: "Analysis" },
  { collapsible: true, section: "utility", title: "Utility" },
];

const BOT_TRADE_MAX_ATTEMPTS = 2;
const DERIV_TEMPORARY_PROCESSING_MESSAGE =
  "Sorry, an error occurred while processing your request.";

function currentSettingsStorageKey(userId?: string | null) {
  return `arktrader:bot-builder:${userId ?? "guest"}:current-settings`;
}

function savedPresetsStorageKey(userId?: string | null) {
  return `arktrader:bot-builder:${userId ?? "guest"}:saved-presets`;
}

function readCurrentBotSettings(userId?: string | null) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(currentSettingsStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== CURRENT_SETTINGS_STORAGE_VERSION) return null;
    if (!isRecord(parsed.settings)) return null;
    return settingsFromRecord(parsed.settings);
  } catch {
    return null;
  }
}

function writeCurrentBotSettings(userId: string | null | undefined, settings: BotSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      currentSettingsStorageKey(userId),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        settings,
        version: CURRENT_SETTINGS_STORAGE_VERSION,
      }),
    );
  } catch {
    /* Local persistence is best effort. */
  }
}

function readSavedBotPresets(userId?: string | null): SavedBotPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(savedPresetsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== SAVED_PRESETS_STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.presets)) return [];
    return parsed.presets
      .map(savedPresetFromRecord)
      .filter((preset): preset is SavedBotPreset => Boolean(preset));
  } catch {
    return [];
  }
}

function writeSavedBotPresets(userId: string | null | undefined, presets: SavedBotPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      savedPresetsStorageKey(userId),
      JSON.stringify({
        presets,
        savedAt: new Date().toISOString(),
        version: SAVED_PRESETS_STORAGE_VERSION,
      }),
    );
  } catch {
    /* Local persistence is best effort. */
  }
}

function savedPresetFromRecord(value: unknown) {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const source = value.source;
  return {
    id: readString(value, "id", crypto.randomUUID()),
    name: readString(value, "name", "Saved bot preset"),
    savedAt: readString(value, "savedAt", new Date().toISOString()),
    settings: settingsFromRecord(value.settings),
    source:
      source === "deployed" || source === "imported" || source === "manual" ? source : "manual",
  } satisfies SavedBotPreset;
}

function BotBuilderPage() {
  const { user, loading: authLoading } = useAuth();
  const { preset } = Route.useSearch();
  const { account, currency: accountCurrency, refreshBalances } = useDerivBalanceContext();
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState<BotSettings>(initialSettings);
  const [status, setStatus] = useState<BotStatus>("stopped");
  const [activeTab, setActiveTab] = useState("summary");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [monitorCollapsed, setMonitorCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([
    {
      id: "ready",
      message: "Bot builder is ready. Configure the blocks and press Run.",
      time: formatTime(),
      type: "info",
    },
  ]);
  const [stats, setStats] = useState<BotStats>({
    contractsLost: 0,
    contractsWon: 0,
    runs: 0,
    totalPayout: 0,
    totalProfitLoss: 0,
    totalStake: 0,
  });
  const [history, setHistory] = useState<BotSettings[]>([]);
  const [redoStack, setRedoStack] = useState<BotSettings[]>([]);
  const [savedPresets, setSavedPresets] = useState<SavedBotPreset[]>([]);
  const [activeSavedPresetId, setActiveSavedPresetId] = useState<string | null>(null);
  const [activePresetName, setActivePresetName] = useState("Unsaved bot");
  const [hydratedStorageUser, setHydratedStorageUser] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedUserRef = useRef<string | null>(null);
  const loadedRoutePresetRef = useRef<string | null>(null);
  const skipPersistOnceRef = useRef(false);
  const runningRef = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!isMobile) return;
    setLeftCollapsed(true);
    setMonitorCollapsed(true);
  }, [isMobile]);

  useEffect(() => {
    if (authLoading) return;
    const storageUserId = user?.id ?? "guest";
    const routePresetId = preset?.trim();
    const routePresetKey = `${storageUserId}:${routePresetId ?? ""}`;
    const localPresets = readSavedBotPresets(user?.id);
    setSavedPresets(localPresets);

    if (routePresetId && loadedRoutePresetRef.current !== routePresetKey) {
      const deployedPreset = BOT_PRESET_CONFIGS.find((item) => item.id === routePresetId);
      loadedRoutePresetRef.current = routePresetKey;
      hydratedUserRef.current = storageUserId;
      setHydratedStorageUser(storageUserId);
      setStorageReady(true);

      if (!deployedPreset) {
        toast.error("That bot preset could not be found.");
        addJournal(`Preset ${routePresetId} was not found.`, "error");
        return;
      }

      const nextSettings = settingsFromBotPreset(deployedPreset);
      skipPersistOnceRef.current = true;
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      setHistory([]);
      setRedoStack([]);
      setActiveSavedPresetId(null);
      setActivePresetName(deployedPreset.name);
      writeCurrentBotSettings(user?.id, nextSettings);
      recordBotPresetActivity(user?.id, "deployed", deployedPreset.name, deployedPreset.id);
      addJournal(`Loaded deployed preset: ${deployedPreset.name}.`, "success");
      toast.success(`${deployedPreset.name} loaded in the bot builder.`);
      return;
    }

    if (!routePresetId && hydratedUserRef.current !== storageUserId) {
      const storedSettings = readCurrentBotSettings(user?.id);
      hydratedUserRef.current = storageUserId;
      setHydratedStorageUser(storageUserId);
      setStorageReady(true);

      if (storedSettings) {
        skipPersistOnceRef.current = true;
        setSettings(storedSettings);
        settingsRef.current = storedSettings;
        setHistory([]);
        setRedoStack([]);
        setActiveSavedPresetId(null);
        setActivePresetName("Restored bot");
        addJournal("Restored the last bot builder configuration.", "success");
      }
      return;
    }

    setHydratedStorageUser(storageUserId);
    setStorageReady(true);
  }, [authLoading, preset, user?.id]);

  useEffect(() => {
    const storageUserId = user?.id ?? "guest";
    if (!storageReady || hydratedStorageUser !== storageUserId) return;
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    writeCurrentBotSettings(user?.id, settings);
  }, [hydratedStorageUser, settings, storageReady, user?.id]);

  useEffect(() => {
    if (!accountCurrency) return;
    updateSettings({ currency: accountCurrency });
  }, [accountCurrency]);

  useEffect(() => {
    rememberMarketSelection(user?.id, "bot-builder", settings.symbol);
  }, [settings.symbol, user?.id]);

  useEffect(() => {
    persistBotMonitorSnapshot(user?.id, {
      journal,
      stats,
      status,
      transactions,
      updatedAt: new Date().toISOString(),
    });
  }, [journal, stats, status, transactions, user?.id]);

  const filteredMenu = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return blockMenu;
    return blockMenu.filter((item) => item.title.toLowerCase().includes(query));
  }, [searchTerm]);

  function addJournal(message: string, type: JournalEntry["type"] = "info") {
    setJournal((current) => [
      { id: crypto.randomUUID(), message, time: formatTime(), type },
      ...current,
    ]);
  }

  function updateSettings(patch: Partial<BotSettings>) {
    setSettings((current) => {
      const next = normalizeSettings({ ...current, ...patch });
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      setHistory((items) => [...items.slice(-24), current]);
      setRedoStack([]);
      return next;
    });
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setRedoStack((items) => [settings, ...items]);
    setSettings(previous);
    setHistory((items) => items.slice(0, -1));
    addJournal("Undo applied.", "info");
  }

  function redo() {
    const next = redoStack[0];
    if (!next) return;
    setHistory((items) => [...items, settings]);
    setSettings(next);
    setRedoStack((items) => items.slice(1));
    addJournal("Redo applied.", "info");
  }

  function resetBot() {
    runningRef.current = false;
    setStatus("stopped");
    setStats({
      contractsLost: 0,
      contractsWon: 0,
      runs: 0,
      totalPayout: 0,
      totalProfitLoss: 0,
      totalStake: 0,
    });
    setTransactions([]);
    addJournal("Bot statistics reset.", "info");
  }

  function saveSettings() {
    const suggestedName =
      activePresetName === "Unsaved bot" || activePresetName === "Restored bot"
        ? "My bot preset"
        : activePresetName;
    const name = window.prompt("Save bot preset as", suggestedName)?.trim();
    if (!name) return;

    const now = new Date().toISOString();
    const existingPreset = savedPresets.find((item) => item.id === activeSavedPresetId);
    const savedPreset: SavedBotPreset = {
      id: existingPreset?.id ?? `preset-${crypto.randomUUID()}`,
      name,
      savedAt: now,
      settings: settingsRef.current,
      source: existingPreset?.source ?? "manual",
    };
    const nextPresets = [savedPreset, ...savedPresets.filter((item) => item.id !== savedPreset.id)];

    setSavedPresets(nextPresets);
    setActiveSavedPresetId(savedPreset.id);
    setActivePresetName(name);
    writeSavedBotPresets(user?.id, nextPresets);
    writeCurrentBotSettings(user?.id, settingsRef.current);
    recordBotPresetActivity(user?.id, "saved", name, savedPreset.id);
    addJournal(`Preset "${name}" saved locally.`, "success");
    toast.success("Bot preset saved.");
  }

  function loadSavedPreset(savedPreset: SavedBotPreset) {
    setSettings(savedPreset.settings);
    settingsRef.current = savedPreset.settings;
    setHistory([]);
    setRedoStack([]);
    setActiveSavedPresetId(savedPreset.id);
    setActivePresetName(savedPreset.name);
    writeCurrentBotSettings(user?.id, savedPreset.settings);
    recordBotPresetActivity(user?.id, "loaded", savedPreset.name, savedPreset.id);
    addJournal(`Loaded saved preset: ${savedPreset.name}.`, "success");
    toast.success(`${savedPreset.name} loaded.`);
  }

  function deleteSavedPreset(presetId: string) {
    const presetToDelete = savedPresets.find((item) => item.id === presetId);
    if (!presetToDelete) return;
    const confirmed = window.confirm(`Delete "${presetToDelete.name}" from saved presets?`);
    if (!confirmed) return;

    const nextPresets = savedPresets.filter((item) => item.id !== presetId);
    setSavedPresets(nextPresets);
    writeSavedBotPresets(user?.id, nextPresets);
    if (activeSavedPresetId === presetId) {
      setActiveSavedPresetId(null);
      setActivePresetName("Unsaved bot");
    }
    recordBotPresetActivity(user?.id, "deleted", presetToDelete.name, presetToDelete.id);
    addJournal(`Deleted preset: ${presetToDelete.name}.`, "warning");
    toast.success("Bot preset deleted.");
  }

  async function importBotFile(file?: File) {
    if (!file) return;
    try {
      const imported = parseImportedBot(await file.text(), file.name);
      const savedPreset: SavedBotPreset = {
        id: `import-${crypto.randomUUID()}`,
        name: imported.name,
        savedAt: new Date().toISOString(),
        settings: imported.settings,
        source: "imported",
      };
      const nextPresets = [
        savedPreset,
        ...savedPresets.filter((item) => item.id !== savedPreset.id),
      ];

      setSavedPresets(nextPresets);
      setSettings(imported.settings);
      settingsRef.current = imported.settings;
      setHistory([]);
      setRedoStack([]);
      setActiveSavedPresetId(savedPreset.id);
      setActivePresetName(imported.name);
      writeSavedBotPresets(user?.id, nextPresets);
      writeCurrentBotSettings(user?.id, imported.settings);
      recordBotPresetActivity(user?.id, "imported", imported.name, savedPreset.id);
      addJournal(`Imported bot file: ${file.name}.`, "success");
      toast.success("Bot imported into the builder.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The bot file could not be imported.";
      addJournal(message, "error");
      toast.error(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runBot() {
    if (status === "running") {
      runningRef.current = false;
      setStatus("stopped");
      addJournal(
        "Stop requested. The bot will stop after the current contract settles.",
        "warning",
      );
      return;
    }

    if (!user) {
      toast.error("Sign in to run the bot.");
      addJournal("Run blocked: no user signed in.", "error");
      return;
    }

    if (!account) {
      toast.error("No account selected. Select an account before running the bot.");
      addJournal("Run blocked: no account selected.", "error");
      return;
    }

    runningRef.current = true;
    setStatus("running");
    setActiveTab("summary");
    addJournal("Bot run started.", "success");

    try {
      const runCurrency = accountCurrency || account.currency || settingsRef.current.currency;
      const context = {
        adapter: "oauth2PkceTradingAdapter" as const,
        contractType: contractTypeLabel(settingsRef.current),
        selectedAccountId: account.account_id,
        selectedAccountType: account.normalizedType,
      };
      let currentStake = settingsRef.current.stake;
      let runningProfit = stats.totalProfitLoss;

      for (let index = 0; runningRef.current && index < settingsRef.current.maxRuns; index += 1) {
        const snapshot = normalizeSettings({ ...settingsRef.current, currency: runCurrency });
        const stake = clampNumber(currentStake, 0.35, snapshot.maxStake);
        if (!conditionAllowsTrade(snapshot, stake, index + 1, runningProfit)) {
          addJournal("Purchase condition is false. Waiting for the next run cycle.", "warning");
          if (!snapshot.tradeEveryTick) break;
          await sleep(700);
          continue;
        }

        const input = proposalInput(snapshot, stake);
        let settlement: Settlement | null = null;
        let tradeError: unknown = null;
        for (let attempt = 1; attempt <= BOT_TRADE_MAX_ATTEMPTS; attempt += 1) {
          let contractWasBought = false;
          try {
            const payload = buildStandardProposalPayload(input, "oauth2PkceTradingAdapter");
            addJournal(
              `Requesting proposal for ${contractTypeLabel(snapshot)} with ${stake.toFixed(2)} ${snapshot.currency}.`,
            );
            const proposal = await requestProposal(payload, {
              ...context,
              contractType: String(payload.contract_type ?? context.contractType),
            });
            const proposalId = String(proposal.proposal?.id ?? "");
            const askPrice = positiveNumberFrom(proposal.proposal?.ask_price, stake) ?? stake;
            const buy = await buyProposal(proposalId, askPrice, {
              ...context,
              contractType: String(payload.contract_type ?? context.contractType),
            });
            const contractId = String(buy.buy?.contract_id ?? "");
            contractWasBought = true;
            const record: Transaction = {
              contractId,
              entrySpot: null,
              exitSpot: null,
              id: crypto.randomUUID(),
              payout: 0,
              profit: 0,
              stake,
              status: "open",
              time: formatTime(),
            };
            setTransactions((items) => [record, ...items]);
            upsertTrackedTrade(user?.id, {
              contractId,
              contractType: String(payload.contract_type ?? context.contractType),
              currency: snapshot.currency,
              id: record.id,
              market: snapshot.symbol,
              openedAt: new Date().toISOString(),
              payout: 0,
              profitLoss: 0,
              source: "bot-builder",
              stake,
              status: "open",
            });
            addJournal(`Bought contract ${contractId}. Waiting for settlement.`, "success");
            settlement = await waitForSettlement(contractId);

            setTransactions((items) =>
              items.map((item) =>
                item.id === record.id
                  ? {
                      ...item,
                      entrySpot: settlement?.entrySpot ?? null,
                      exitSpot: settlement?.exitSpot ?? null,
                      payout: settlement?.payout ?? 0,
                      profit: settlement?.profit ?? 0,
                      status: settlement?.status ?? "open",
                    }
                  : item,
              ),
            );
            updateTrackedTrade(user?.id, contractId, {
              closedAt: new Date().toISOString(),
              payout: settlement?.payout ?? 0,
              profitLoss: settlement?.profit ?? 0,
              status:
                settlement?.status === "won"
                  ? "won"
                  : settlement?.status === "lost"
                    ? "lost"
                    : "open",
            });
            tradeError = null;
            break;
          } catch (error) {
            tradeError = error;
            if (
              !contractWasBought &&
              attempt < BOT_TRADE_MAX_ATTEMPTS &&
              shouldRetryBotTrade(error)
            ) {
              addJournal("A temporary processing error occurred. Retrying once.", "warning");
              await sleep(1500);
              continue;
            }
            break;
          }
        }

        if (!settlement) {
          const message = getDerivTradingErrorMessage(tradeError);
          if (snapshot.restartBuySellOnError || snapshot.restartLastTradeOnError) {
            addJournal(`Skipped one bot run after trade error: ${message}`, "warning");
            await sleep(700);
            continue;
          }
          throw tradeError;
        }

        runningProfit += settlement.profit;
        setStats((current) => ({
          contractsLost: current.contractsLost + (settlement.status === "lost" ? 1 : 0),
          contractsWon: current.contractsWon + (settlement.status === "won" ? 1 : 0),
          runs: current.runs + 1,
          totalPayout: current.totalPayout + settlement.payout,
          totalProfitLoss: current.totalProfitLoss + settlement.profit,
          totalStake: current.totalStake + stake,
        }));
        addJournal(
          `Contract settled ${settlement.status}. P/L ${settlement.profit.toFixed(2)} ${snapshot.currency}.`,
          settlement.status === "won"
            ? "success"
            : settlement.status === "lost"
              ? "warning"
              : "info",
        );
        await refreshBalances("bot-builder-trade-complete", account.account_id).catch((error) => {
          console.warn("[Bot Builder] balance refresh after settled trade failed", error);
        });

        if (runningProfit >= snapshot.takeProfit || runningProfit <= -Math.abs(snapshot.stopLoss)) {
          addJournal("Profit or loss threshold reached. Bot stopped.", "warning");
          break;
        }
        currentStake =
          settlement.status === "lost"
            ? clampNumber(stake * snapshot.martingale, 0.35, snapshot.maxStake)
            : snapshot.stake;
        if (!snapshot.tradeEveryTick) await sleep(1000);
      }

      await refreshBalances("bot-builder-run-complete", account.account_id).catch((error) => {
        console.warn("[Bot Builder] final balance refresh after run failed", error);
      });
      setStatus("stopped");
      runningRef.current = false;
      addJournal("Bot run completed.", "success");
    } catch (error) {
      const message = getDerivTradingErrorMessage(error);
      runningRef.current = false;
      setStatus("error");
      addJournal(message, "error");
      toast.error(message);
    }
  }

  return (
    <TopShell showAssistantButton={false} showBotMonitor={false}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xml,application/json,text/xml,application/xml"
        className="hidden"
        onChange={(event) => void importBotFile(event.target.files?.[0])}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[#e9eaec] p-2 text-[#171717] dark:bg-[#0f0f0f]">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden lg:grid lg:h-[calc(100dvh-6.25rem)] lg:min-h-[620px] lg:gap-4",
            leftCollapsed && monitorCollapsed && "lg:grid-cols-[52px_minmax(0,1fr)_52px]",
            leftCollapsed && !monitorCollapsed && "lg:grid-cols-[52px_minmax(0,1fr)_354px]",
            !leftCollapsed && monitorCollapsed && "lg:grid-cols-[228px_minmax(0,1fr)_52px]",
            !leftCollapsed && !monitorCollapsed && "lg:grid-cols-[228px_minmax(0,1fr)_354px]",
          )}
        >
          <BlocksMenu
            activeSavedPresetId={activeSavedPresetId}
            collapsed={leftCollapsed}
            filteredMenu={filteredMenu}
            onDeletePreset={deleteSavedPreset}
            onLoadPreset={loadSavedPreset}
            onSearch={setSearchTerm}
            onToggle={() => setLeftCollapsed((value) => !value)}
            searchTerm={searchTerm}
            savedPresets={savedPresets}
          />
          <WorkspaceCanvas
            monitorCollapsed={monitorCollapsed}
            onImport={() => fileInputRef.current?.click()}
            onRedo={redo}
            onReset={resetBot}
            onSave={saveSettings}
            onUndo={undo}
            onZoomIn={() => setZoom((value) => Math.min(1.2, Number((value + 0.05).toFixed(2))))}
            onZoomOut={() => setZoom((value) => Math.max(0.7, Number((value - 0.05).toFixed(2))))}
            settings={settings}
            updateSettings={updateSettings}
            zoom={zoom}
          />
          <BotRunMonitorPanel
            activeTab={activeTab}
            collapsed={monitorCollapsed}
            currency={settings.currency}
            journal={journal}
            onReset={resetBot}
            onRun={runBot}
            onToggleCollapse={() => setMonitorCollapsed((value) => !value)}
            setActiveTab={setActiveTab}
            stats={stats}
            status={status}
            transactions={transactions}
          />
        </div>
      </div>
    </TopShell>
  );
}

function BlocksMenu({
  activeSavedPresetId,
  collapsed,
  filteredMenu,
  onDeletePreset,
  onLoadPreset,
  onSearch,
  onToggle,
  searchTerm,
  savedPresets,
}: {
  activeSavedPresetId: string | null;
  collapsed: boolean;
  filteredMenu: typeof blockMenu;
  onDeletePreset: (presetId: string) => void;
  onLoadPreset: (preset: SavedBotPreset) => void;
  onSearch: (value: string) => void;
  onToggle: () => void;
  searchTerm: string;
  savedPresets: SavedBotPreset[];
}) {
  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center bg-[#f5f5f5] py-2 dark:bg-[#151515]">
        <button
          type="button"
          onClick={onToggle}
          className="flex size-9 items-center justify-center rounded-[4px] border border-[#d0d2d4] bg-white dark:border-[#333] dark:bg-[#101010]"
        >
          <ChevronRight className="size-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 max-h-[28dvh] flex-col overflow-hidden bg-[#f5f5f5] text-[#101213] lg:max-h-none lg:overflow-hidden dark:bg-[#151515] dark:text-[#eeeeee]">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-[54px] items-center justify-between bg-[#eceeef] px-5 text-base font-bold dark:bg-[#202020]"
      >
        <span>Blocks menu</span>
        <ChevronUp className="size-5" />
      </button>

      <div className="border-b border-[#e1e1e1] bg-white p-4 dark:border-[#2b2b2b] dark:bg-[#151515]">
        <label className="flex h-8 items-center gap-2 rounded-[6px] border border-[#d3d5d6] bg-white px-3 text-[#8d8f92] dark:border-[#333] dark:bg-[#101010]">
          <Search className="size-4" />
          <input
            value={searchTerm}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#333] outline-none placeholder:text-[#a0a0a0] dark:text-[#eeeeee]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-[#151515]">
        {filteredMenu.map((item) => (
          <a
            key={item.title}
            href={`#${item.section}`}
            className="flex h-[41px] w-full items-center justify-between border-b border-[#eeeeee] px-5 text-left text-sm font-bold hover:bg-[#f7f7f7] dark:border-[#2b2b2b] dark:hover:bg-[#202020]"
          >
            <span>{item.title}</span>
            {item.collapsible && <ChevronDown className="size-5" />}
          </a>
        ))}
      </div>

      <div className="border-t border-[#e1e1e1] bg-white px-3 py-3 dark:border-[#2b2b2b] dark:bg-[#151515]">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#656565] dark:text-[#b7b7b7]">
          Saved presets
        </div>
        {savedPresets.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-[#d7d9db] px-3 py-3 text-xs leading-5 text-[#6e6e6e] dark:border-[#333] dark:text-[#b7b7b7]">
            Save or import a bot to keep it here after refresh.
          </div>
        ) : (
          <div className="max-h-48 space-y-2 overflow-auto pr-1">
            {savedPresets.map((preset) => (
              <div
                key={preset.id}
                className={cn(
                  "flex items-center gap-2 rounded-[4px] border border-[#e0e0e0] bg-[#f8f8f8] p-2 dark:border-[#333] dark:bg-[#202020]",
                  activeSavedPresetId === preset.id &&
                    "border-[#4bb4b3] bg-[#e8f7f7] dark:bg-[#143030]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onLoadPreset(preset)}
                  className="min-w-0 flex-1 text-left"
                  title={`Load ${preset.name}`}
                >
                  <div className="truncate text-xs font-bold">{preset.name}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-[#777]">
                    {preset.source} / {formatShortDate(preset.savedAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(preset.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-[3px] text-[#777] hover:bg-[#ff444f]/10 hover:text-[#c52832]"
                  title={`Delete ${preset.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function WorkspaceCanvas({
  monitorCollapsed,
  onImport,
  onRedo,
  onReset,
  onSave,
  onUndo,
  onZoomIn,
  onZoomOut,
  settings,
  updateSettings,
  zoom,
}: {
  monitorCollapsed: boolean;
  onImport: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSave: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  settings: BotSettings;
  updateSettings: (patch: Partial<BotSettings>) => void;
  zoom: number;
}) {
  return (
    <section
      className={cn(
        "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-white dark:bg-[#101010]",
        monitorCollapsed ? "pb-0" : "pb-0",
        "lg:h-auto lg:min-h-0 lg:flex-none",
      )}
    >
      <WorkspaceToolbar
        onImport={onImport}
        onRedo={onRedo}
        onReset={onReset}
        onSave={onSave}
        onUndo={onUndo}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
      <ScrollArea className="h-full">
        <div className="relative h-[1420px] min-w-[1320px] bg-white dark:bg-[#101010]">
          <div
            className="absolute left-6 top-[62px] origin-top-left"
            style={{ transform: `scale(${zoom})` }}
          >
            <TradeParametersBlock settings={settings} updateSettings={updateSettings} />
            <PurchaseConditionsBlock settings={settings} updateSettings={updateSettings} />
            <FunctionStack settings={settings} updateSettings={updateSettings} />
          </div>
          <div className="absolute right-[-9px] top-1/2 z-20 flex h-12 w-5 -translate-y-1/2 items-center justify-center border border-[#d2d2d2] bg-white text-[#5d5d5d] dark:border-[#333] dark:bg-[#151515]">
            <ChevronLeft className="size-4" />
            <ChevronRight className="-ml-3 size-4" />
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function WorkspaceToolbar({
  onImport,
  onRedo,
  onReset,
  onSave,
  onUndo,
  onZoomIn,
  onZoomOut,
}: {
  onImport: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSave: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const actions = [
    { icon: RefreshCw, label: "Reset", onClick: onReset },
    { icon: FolderOpen, label: "Import bot", onClick: onImport },
    { icon: Save, label: "Save preset", onClick: onSave },
    { icon: LayoutList, label: "Workspace layout", onClick: onReset },
    { icon: LineChart, label: "Analysis view", onClick: onZoomOut },
    { icon: BarChart2, label: "Chart view", onClick: onZoomIn },
    { icon: Undo2, label: "Undo", onClick: onUndo },
    { icon: Redo2, label: "Redo", onClick: onRedo },
    { icon: ZoomIn, label: "Zoom in", onClick: onZoomIn },
    { icon: ZoomOut, label: "Zoom out", onClick: onZoomOut },
  ];

  return (
    <div className="absolute left-0 right-0 top-0 z-30 flex h-[54px] items-center overflow-x-auto bg-white px-2 sm:px-4 dark:bg-[#101010]">
      <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-[4px] border border-[#d0d2d4] bg-white dark:border-[#333] dark:bg-[#151515]">
        {actions.map(({ icon: Icon, label, onClick }, index) => (
          <button
            key={label}
            aria-label={label}
            className={cn(
              "flex size-10 items-center justify-center text-[#1f1f1f] hover:bg-[#f5f5f5] dark:text-[#e6e6e6] dark:hover:bg-[#202020]",
              index === 3 || index === 5 || index === 7
                ? "border-r border-[#d9dbdc]"
                : "border-r border-transparent",
            )}
            title={label}
            type="button"
            onClick={onClick}
          >
            <Icon className="size-[18px]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TradeParametersBlock({
  settings,
  updateSettings,
}: {
  settings: BotSettings;
  updateSettings: (patch: Partial<BotSettings>) => void;
}) {
  return (
    <div id="trade" className="w-[760px]">
      <GreenHeader title="1. Trade parameters" width="w-[210px]" />
      <div className="rounded-b-[3px] bg-[#075773] pb-2 pl-2 pr-3 pt-2 text-[10px] text-[#242424] shadow-sm">
        <div className="space-y-2">
          <BlockLine>
            Market:{" "}
            <SelectPill
              options={["Derived"]}
              value={settings.market}
              onChange={(market) => updateSettings({ market })}
            />{" "}
            <span>&gt;</span>{" "}
            <SelectPill
              options={["Continuous Indices"]}
              value={settings.assetCategory}
              onChange={(assetCategory) => updateSettings({ assetCategory })}
            />{" "}
            <span>&gt;</span>{" "}
            <SelectPill
              options={symbolOptions}
              value={settings.symbol}
              onChange={(symbol) => updateSettings({ symbol })}
            />
          </BlockLine>
          <BlockLine>
            Trade Type:{" "}
            <SelectPill
              options={[
                { label: "Digits", value: "digits" },
                { label: "Rise/Fall", value: "rise_fall" },
                { label: "Higher/Lower", value: "higher_lower" },
                { label: "Touch/No Touch", value: "touch_no_touch" },
                { label: "Multiplier", value: "multiplier" },
              ]}
              value={settings.tradeType}
              onChange={(tradeType) => updateSettings({ tradeType: tradeType as TradeTypeUi })}
            />{" "}
            <span>&gt;</span>{" "}
            <SelectPill
              options={contractFamilyOptions(settings.tradeType)}
              value={contractFamilyValue(settings)}
              onChange={(value) => updateSettings(contractFamilyPatch(settings.tradeType, value))}
            />
          </BlockLine>
          <BlockLine>
            Contract Type:{" "}
            <SelectPill
              options={purchaseDirectionOptions(settings)}
              value={settings.purchaseDirection}
              onChange={(purchaseDirection) => updateSettings({ purchaseDirection })}
            />
          </BlockLine>
          <BlockLine>
            Default Candle Interval:{" "}
            <SelectPill
              options={["1 minute", "2 minutes", "5 minutes", "15 minutes"]}
              value={settings.candleInterval}
              onChange={(candleInterval) => updateSettings({ candleInterval })}
            />
          </BlockLine>
          <BlockLine className="w-[265px]">
            Restart buy/sell on error (disable for better performance):{" "}
            <TinySquare
              checked={settings.restartBuySellOnError}
              onChange={(restartBuySellOnError) => updateSettings({ restartBuySellOnError })}
            />
          </BlockLine>
          <BlockLine className="w-[276px]">
            Restart last trade on error (bot ignores the unsuccessful trade):{" "}
            <TinySquare
              checked={settings.restartLastTradeOnError}
              onChange={(restartLastTradeOnError) => updateSettings({ restartLastTradeOnError })}
            />
          </BlockLine>
          <BlockLine className="w-[162px]">
            Trade every tick:{" "}
            <TinySquare
              checked={settings.tradeEveryTick}
              onChange={(tradeEveryTick) => updateSettings({ tradeEveryTick })}
            />
          </BlockLine>
        </div>
        <GreenHeader title="Run once at start:" width="w-[210px]" className="mt-2" />
        <div className="space-y-1 rounded-b-[3px] bg-[#eeeeee] p-1">
          <BlockLine className="w-[140px]">
            Run at start{" "}
            <TinySquare
              checked={settings.runOnceAtStart}
              onChange={(runOnceAtStart) => updateSettings({ runOnceAtStart })}
            />
          </BlockLine>
          <SetLine
            label="stake"
            value={
              <NumberPill
                min={0.35}
                step={0.01}
                value={settings.stake}
                onChange={(stake) => updateSettings({ stake })}
              />
            }
          />
          <SetLine
            label="maxStake"
            value={
              <NumberPill
                min={0.35}
                step={0.01}
                value={settings.maxStake}
                onChange={(maxStake) => updateSettings({ maxStake })}
              />
            }
          />
          <SetLine
            label="martingale"
            value={
              <NumberPill
                min={1}
                step={0.1}
                value={settings.martingale}
                onChange={(martingale) => updateSettings({ martingale })}
              />
            }
          />
          <SetLine
            label="Expected Profit"
            value={
              <NumberPill
                min={0}
                step={1}
                value={settings.takeProfit}
                onChange={(takeProfit) => updateSettings({ takeProfit })}
              />
            }
          />
          <SetLine
            label="Stop Loss"
            value={
              <NumberPill
                min={0}
                step={1}
                value={settings.stopLoss}
                onChange={(stopLoss) => updateSettings({ stopLoss })}
              />
            }
          />
          <SetLine
            label="No. of runs"
            value={
              <NumberPill
                min={1}
                step={1}
                value={settings.maxRuns}
                onChange={(maxRuns) => updateSettings({ maxRuns })}
              />
            }
          />
        </div>
        <GreenHeader title="Trade options:" width="w-[210px]" className="mt-2" />
        <BlockLine className="w-[940px]">
          Duration:{" "}
          <SelectPill
            options={[
              { label: "Ticks", value: "t" },
              { label: "Seconds", value: "s" },
              { label: "Minutes", value: "m" },
            ]}
            value={settings.durationUnit}
            onChange={(durationUnit) =>
              updateSettings({ durationUnit: durationUnit as DurationUnit })
            }
          />{" "}
          <NumberPill
            min={1}
            step={1}
            value={settings.duration}
            onChange={(duration) => updateSettings({ duration })}
          />{" "}
          Stake:{" "}
          <SelectPill
            options={["USD", "EUR", "GBP", "USDT"]}
            value={settings.currency}
            onChange={(currency) => updateSettings({ currency })}
          />{" "}
          <NumberPill
            min={0.35}
            step={0.01}
            value={settings.stake}
            onChange={(stake) => updateSettings({ stake })}
          />{" "}
          (min: 0.35 - max: 50000) prediction:{" "}
          <NumberPill
            min={0}
            step={1}
            value={settings.selectedDigit}
            onChange={(selectedDigit) => updateSettings({ selectedDigit })}
          />
        </BlockLine>
      </div>
    </div>
  );
}

function PurchaseConditionsBlock({
  settings,
  updateSettings,
}: {
  settings: BotSettings;
  updateSettings: (patch: Partial<BotSettings>) => void;
}) {
  return (
    <div id="purchase" className="mt-6 w-[460px]">
      <GreenHeader title="2. Purchase conditions" width="w-[210px]" />
      <div className="rounded-b-[3px] bg-[#075773] p-2 text-[10px] text-[#242424]">
        <BlockLine className="w-[420px]">
          Purchase{" "}
          <SelectPill
            options={purchaseDirectionOptions(settings)}
            value={settings.purchaseDirection}
            onChange={(purchaseDirection) => updateSettings({ purchaseDirection })}
          />{" "}
          if{" "}
          <SelectPill
            options={["All", "Any"]}
            value={settings.conditionJoin}
            onChange={(conditionJoin) =>
              updateSettings({ conditionJoin: conditionJoin as "All" | "Any" })
            }
          />{" "}
          condition is true
        </BlockLine>
        <BlockLine className="mt-1 w-[430px]">
          <SelectPill
            options={["Last Digit", "Total Profit", "Stake", "Run Count"]}
            value={settings.conditionLeft}
            onChange={(conditionLeft) => updateSettings({ conditionLeft })}
          />{" "}
          <SelectPill
            options={[">", "<", "=", "contains"]}
            value={settings.conditionOperator}
            onChange={(conditionOperator) => updateSettings({ conditionOperator })}
          />{" "}
          <TextPill
            value={settings.conditionRight}
            onChange={(conditionRight) => updateSettings({ conditionRight })}
          />
        </BlockLine>
        <NestedMini label="Last Digit >" settings={settings} updateSettings={updateSettings} />
        <NestedMini label="Last Digit <" settings={settings} updateSettings={updateSettings} />
      </div>
    </div>
  );
}

function FunctionStack({
  settings,
  updateSettings,
}: {
  settings: BotSettings;
  updateSettings: (patch: Partial<BotSettings>) => void;
}) {
  return (
    <div className="mt-8 w-[740px] space-y-10 text-[10px] text-[#242424]">
      <BlockLine className="w-[430px]">
        function <strong>Martingale Core Functionality</strong> with:
      </BlockLine>
      <BlockLine className="ml-0 w-[360px]">
        function <strong>Martingale Trade Amount ()</strong> multiplier{" "}
        <NumberPill
          min={1}
          step={0.1}
          value={settings.martingale}
          onChange={(martingale) => updateSettings({ martingale })}
        />
      </BlockLine>
      <BlockLine className="ml-0 w-[330px]">
        function <strong>marketwizard v1.5 ()</strong> max runs{" "}
        <NumberPill
          min={1}
          step={1}
          value={settings.maxRuns}
          onChange={(maxRuns) => updateSettings({ maxRuns })}
        />
      </BlockLine>
      <div id="restart" className="space-y-2 rounded-[3px] bg-[#ededed] p-3">
        <BlockLine className="w-[650px]">
          function <strong>Martingale Trade Again After Purchase</strong> with: martingale:profit,
          martingale:resultIsWin <RoundPlus />
        </BlockLine>
        <BlockLine className="ml-6 w-[410px]">
          change <Pill>martingale:totalProfit</Pill> by <Pill>martingale:profit</Pill>
        </BlockLine>
        <BlockLine className="ml-6 w-[580px]">
          set <Pill>martingale:totalProfit</Pill> to <Pill>round</Pill>{" "}
          <Pill>martingale:totalProfit</Pill> * 100 / 100
        </BlockLine>
        <BlockLine className="ml-6 w-[570px]">
          Martingale Core Functionality with: martingale:resultIsWin{" "}
          <Pill>martingale:resultIsWin</Pill>
        </BlockLine>
        <BlockLine className="ml-6 w-[390px]">
          set <Pill>Notification:totalProfit</Pill> to create text with <RoundPlus />
        </BlockLine>
        <BlockLine className="ml-12 w-[220px]">
          Total Profit: <RoundMinus />
        </BlockLine>
        <BlockLine className="ml-12 w-[245px]">
          <Pill>martingale:totalProfit</Pill> <RoundMinus />
        </BlockLine>
        <BlockLine className="ml-6 w-[520px]">
          Notify <Pill>blue</Pill> with sound: <Pill>Silent</Pill>{" "}
          <Pill>Notification:totalProfit</Pill>
        </BlockLine>
        <BlockLine className="ml-6 w-[330px]">
          set <Pill>martingale:tradeAgain</Pill> to{" "}
          <SelectPill
            options={[
              { label: "false", value: "false" },
              { label: "true", value: "true" },
            ]}
            value={settings.restartLastTradeOnError ? "true" : "false"}
            onChange={(value) => updateSettings({ restartLastTradeOnError: value === "true" })}
          />
        </BlockLine>
        <BlockLine className="ml-6 w-[620px]">
          if <Pill>martingale:totalProfit</Pill> &lt;{" "}
          <NumberPill
            min={0}
            step={1}
            value={settings.takeProfit}
            onChange={(takeProfit) => updateSettings({ takeProfit })}
          />{" "}
          then stop
        </BlockLine>
        <BlockLine className="ml-12 w-[650px]">
          if <Pill>martingale:totalProfit</Pill> &gt;{" "}
          <NumberPill
            min={0}
            step={1}
            value={settings.stopLoss}
            onChange={(stopLoss) => updateSettings({ stopLoss })}
          />{" "}
          then stop
        </BlockLine>
      </div>
    </div>
  );
}

function GreenHeader({
  className,
  title,
  width,
}: {
  className?: string;
  title: string;
  width: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[28px] items-center rounded-t-[3px] bg-[#075773] px-3 text-xs font-bold text-white",
        width,
        className,
      )}
    >
      {title}
    </div>
  );
}

function BlockLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex min-h-[26px] items-center gap-1 rounded-[3px] bg-[#eeeeee] px-2 shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SetLine({
  label,
  plus,
  value,
}: {
  label: string;
  plus?: boolean;
  value?: React.ReactNode;
}) {
  return (
    <BlockLine className="w-fit">
      set <Pill>{label}</Pill>
      {value && <>to {value}</>}
      {plus && <RoundPlus />}
    </BlockLine>
  );
}

function NestedMini({
  label,
  settings,
  updateSettings,
}: {
  label: string;
  settings: BotSettings;
  updateSettings: (patch: Partial<BotSettings>) => void;
}) {
  return (
    <div className="ml-8 mt-1 flex w-[220px] items-center justify-between rounded-[3px] bg-[#eeeeee] px-2 py-1">
      <span>{label}</span>
      <NumberPill
        min={0}
        step={1}
        value={settings.selectedDigit}
        onChange={(selectedDigit) => updateSettings({ selectedDigit })}
      />
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-[#d8d8d8] bg-white px-2 text-[10px] shadow-sm">
      {children}
      <ChevronDown className="ml-1 size-3" />
    </span>
  );
}

function SelectPill({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Array<string | { label: string; value: string }>;
  value: string;
}) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-[#d8d8d8] bg-white px-1 text-[10px] shadow-sm">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[160px] bg-transparent px-1 text-[10px] font-medium outline-none"
      >
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </span>
  );
}

function NumberPill({
  min,
  onChange,
  step,
  value,
}: {
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-[22px] w-[58px] rounded-full border border-[#d8d8d8] bg-white px-2 text-right text-[10px] font-medium shadow-sm outline-none"
    />
  );
}

function TextPill({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-[22px] w-[70px] rounded-full border border-[#d8d8d8] bg-white px-2 text-[10px] font-medium shadow-sm outline-none"
    />
  );
}

function TinySquare({
  checked,
  onChange,
}: {
  checked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex size-4 items-center justify-center rounded-[2px] bg-white text-[10px]"
    >
      {checked ? "x" : ""}
    </button>
  );
}

function RoundPlus() {
  return (
    <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#333] text-[11px] font-bold text-white">
      +
    </span>
  );
}

function RoundMinus() {
  return (
    <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#333] text-[11px] font-bold text-white">
      -
    </span>
  );
}

function settingsFromBotPreset(preset: BotPresetConfig): BotSettings {
  const stake = Number(preset.stake) || initialSettings.stake;
  const martingale = Number(preset.martingale) || initialSettings.martingale;
  const direction = preset.contractType.toLowerCase();
  const condition =
    preset.tradeType === "even_odd"
      ? {
          conditionOperator: "contains",
          conditionRight: direction === "odd" ? "1,3,5,7,9" : "0,2,4,6,8",
        }
      : preset.tradeType === "matches_differs"
        ? {
            conditionOperator: direction === "matches" ? "=" : ">",
            conditionRight:
              direction === "matches"
                ? String(preset.predictionDigit)
                : String(Math.max(0, preset.predictionDigit - 1)),
          }
        : {
            conditionOperator: direction === "under" ? "<" : ">",
            conditionRight: String(
              direction === "under"
                ? Math.min(9, preset.predictionDigit + 1)
                : Math.max(0, preset.predictionDigit - 1),
            ),
          };

  return normalizeSettings({
    ...initialSettings,
    conditionLeft: "Last Digit",
    conditionOperator: condition.conditionOperator,
    conditionRight: condition.conditionRight,
    digitContract: preset.tradeType,
    duration: preset.duration,
    durationUnit: preset.durationUnit,
    martingale,
    maxRuns: preset.maxRuns,
    maxStake: Math.max(stake, stake * Math.max(1, martingale) * 8),
    purchaseDirection: direction,
    selectedDigit: preset.predictionDigit,
    stake,
    stopLoss: preset.sl,
    symbol: preset.market,
    takeProfit: preset.tp,
    tradeType: "digits",
  });
}

function parseImportedBot(text: string, fileName: string): ImportedBotSettings {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("The selected bot file is empty.");
  if (fileName.toLowerCase().endsWith(".xml") || trimmed.startsWith("<")) {
    return parseXmlBot(trimmed, fileName);
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const container = isRecord(parsed) ? parsed : {};
    const sourceRecord = importedSettingsRecord(container);
    return {
      name: readString(container, "name", stripFileExtension(fileName)),
      settings: settingsFromRecord(sourceRecord),
    };
  } catch {
    throw new Error("Import failed. Select a valid Deriv XML bot or JSON strategy file.");
  }
}

function importedSettingsRecord(container: Record<string, unknown>) {
  const direct = isRecord(container.settings)
    ? container.settings
    : isRecord(container.botSettings)
      ? container.botSettings
      : isRecord(container.configuration)
        ? container.configuration
        : container;
  const tradeParameters = isRecord(direct.tradeParameters) ? direct.tradeParameters : {};
  const riskSettings = isRecord(direct.riskSettings) ? direct.riskSettings : {};
  return { ...direct, ...tradeParameters, ...riskSettings };
}

function parseXmlBot(text: string, fileName: string): ImportedBotSettings {
  const document = new DOMParser().parseFromString(text, "text/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Import failed. The Deriv XML bot file could not be parsed.");
  }

  const field = (names: string[]) => firstXmlFieldText(document, names);
  const tradeTypeText = [
    field(["TRADETYPE_LIST", "TRADETYPE", "TRADE_TYPE"]),
    field(["TYPE_LIST", "CONTRACT_TYPE", "CONTRACTTYPE"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const prediction = firstFiniteNumber([
    field(["PREDICTION", "BARRIER", "LAST_DIGIT"]),
    firstXmlNumberFromVariable(document, ["prediction", "digit", "barrier"]),
  ]);
  const stake = firstFiniteNumber([
    field(["AMOUNT", "STAKE"]),
    firstXmlNumberFromVariable(document, ["stake", "amount", "initial amount"]),
  ]);

  const next: BotSettings = {
    ...initialSettings,
    currency: field(["CURRENCY", "CURRENCY_LIST"]) ?? initialSettings.currency,
    duration:
      firstFiniteNumber([
        field(["DURATION", "DURATION_LIST"]),
        firstXmlNumberFromVariable(document, ["duration"]),
      ]) ?? initialSettings.duration,
    durationUnit: durationUnitValue(
      field(["DURATIONTYPE_LIST", "DURATION_UNIT", "DURATION_UNIT_LIST"])?.toLowerCase(),
      initialSettings.durationUnit,
    ),
    maxRuns:
      firstXmlNumberFromVariable(document, ["max runs", "runs", "tradesno", "trades no"]) ??
      initialSettings.maxRuns,
    martingale:
      firstXmlNumberFromVariable(document, ["martingale", "multiplier"]) ??
      initialSettings.martingale,
    selectedDigit: prediction ?? initialSettings.selectedDigit,
    stake: stake ?? initialSettings.stake,
    stopLoss:
      firstXmlNumberFromVariable(document, ["stop loss", "stoploss", "loss limit"]) ??
      initialSettings.stopLoss,
    symbol: field(["SYMBOL_LIST", "SYMBOL", "MARKET_LIST", "MARKET"]) ?? initialSettings.symbol,
    takeProfit:
      firstXmlNumberFromVariable(document, ["expected profit", "take profit", "profit target"]) ??
      initialSettings.takeProfit,
    tradeType: "digits",
  };

  if (
    tradeTypeText.includes("over") ||
    tradeTypeText.includes("under") ||
    tradeTypeText.includes("digitover") ||
    tradeTypeText.includes("digitunder")
  ) {
    next.digitContract = "over_under";
    next.purchaseDirection =
      tradeTypeText.includes("under") || tradeTypeText.includes("digitunder") ? "under" : "over";
  } else if (
    tradeTypeText.includes("matches") ||
    tradeTypeText.includes("differs") ||
    tradeTypeText.includes("digitmatch") ||
    tradeTypeText.includes("digitdiff")
  ) {
    next.digitContract = "matches_differs";
    next.purchaseDirection =
      tradeTypeText.includes("differs") || tradeTypeText.includes("digitdiff")
        ? "differs"
        : "matches";
  } else if (
    tradeTypeText.includes("even") ||
    tradeTypeText.includes("odd") ||
    tradeTypeText.includes("digiteven") ||
    tradeTypeText.includes("digitodd")
  ) {
    next.digitContract = "even_odd";
    next.purchaseDirection =
      tradeTypeText.includes("odd") || tradeTypeText.includes("digitodd") ? "odd" : "even";
  }

  if (next.purchaseDirection === "under") {
    next.conditionOperator = "<";
    next.conditionRight = String(Math.min(9, next.selectedDigit + 1));
  } else if (next.purchaseDirection === "odd") {
    next.conditionOperator = "contains";
    next.conditionRight = "1,3,5,7,9";
  } else if (next.purchaseDirection === "even") {
    next.conditionOperator = "contains";
    next.conditionRight = "0,2,4,6,8";
  } else {
    next.conditionOperator = ">";
    next.conditionRight = String(Math.max(0, next.selectedDigit - 1));
  }

  next.maxStake = Math.max(next.stake, next.stake * Math.max(1, next.martingale) * 8);

  return {
    name: stripFileExtension(fileName),
    settings: normalizeSettings(next),
  };
}

function settingsFromRecord(record: Record<string, unknown>): BotSettings {
  const isPresetLike =
    typeof record.contractType === "string" &&
    typeof record.tradeType === "string" &&
    ("tp" in record || "sl" in record || "predictionDigit" in record);
  if (isPresetLike) {
    const stake = readNumber(record, "stake", initialSettings.stake);
    const martingale = readNumber(record, "martingale", initialSettings.martingale);
    const digitContract = digitContractValue(record.tradeType, initialSettings.digitContract);
    const selectedDigit = readNumber(record, "predictionDigit", initialSettings.selectedDigit);
    const purchaseDirection = readString(record, "contractType", initialSettings.purchaseDirection);
    const condition =
      digitContract === "even_odd"
        ? {
            conditionOperator: "contains",
            conditionRight: purchaseDirection === "odd" ? "1,3,5,7,9" : "0,2,4,6,8",
          }
        : digitContract === "matches_differs"
          ? {
              conditionOperator: purchaseDirection === "matches" ? "=" : ">",
              conditionRight:
                purchaseDirection === "matches"
                  ? String(selectedDigit)
                  : String(Math.max(0, selectedDigit - 1)),
            }
          : {
              conditionOperator: purchaseDirection === "under" ? "<" : ">",
              conditionRight: String(
                purchaseDirection === "under"
                  ? Math.min(9, selectedDigit + 1)
                  : Math.max(0, selectedDigit - 1),
              ),
            };
    return normalizeSettings({
      ...initialSettings,
      conditionOperator: condition.conditionOperator,
      conditionRight: condition.conditionRight,
      digitContract,
      duration: readNumber(record, "duration", initialSettings.duration),
      durationUnit: durationUnitValue(record.durationUnit, initialSettings.durationUnit),
      martingale,
      maxRuns: readNumber(record, "maxRuns", initialSettings.maxRuns),
      maxStake: Math.max(stake, stake * Math.max(1, martingale) * 8),
      purchaseDirection,
      selectedDigit,
      stake,
      stopLoss: readNumber(record, "sl", initialSettings.stopLoss),
      symbol: readString(record, "market", initialSettings.symbol),
      takeProfit: readNumber(record, "tp", initialSettings.takeProfit),
      tradeType: "digits",
    });
  }

  return normalizeSettings({
    ...initialSettings,
    assetCategory: readString(record, "assetCategory", initialSettings.assetCategory),
    candleInterval: readString(record, "candleInterval", initialSettings.candleInterval),
    conditionJoin: conditionJoinValue(record.conditionJoin, initialSettings.conditionJoin),
    conditionLeft: readString(record, "conditionLeft", initialSettings.conditionLeft),
    conditionOperator: readString(record, "conditionOperator", initialSettings.conditionOperator),
    conditionRight: readString(record, "conditionRight", initialSettings.conditionRight),
    currency: readString(record, "currency", initialSettings.currency),
    digitContract: digitContractValue(record.digitContract, initialSettings.digitContract),
    duration: readNumber(record, "duration", initialSettings.duration),
    durationUnit: durationUnitValue(record.durationUnit, initialSettings.durationUnit),
    market: readString(record, "market", initialSettings.market),
    martingale: readNumber(record, "martingale", initialSettings.martingale),
    maxRuns: readNumber(record, "maxRuns", initialSettings.maxRuns),
    maxStake: readNumber(record, "maxStake", initialSettings.maxStake),
    purchaseDirection: readString(record, "purchaseDirection", initialSettings.purchaseDirection),
    restartBuySellOnError: readBoolean(
      record,
      "restartBuySellOnError",
      initialSettings.restartBuySellOnError,
    ),
    restartLastTradeOnError: readBoolean(
      record,
      "restartLastTradeOnError",
      initialSettings.restartLastTradeOnError,
    ),
    runOnceAtStart: readBoolean(record, "runOnceAtStart", initialSettings.runOnceAtStart),
    selectedDigit: readNumber(record, "selectedDigit", initialSettings.selectedDigit),
    stake: readNumber(record, "stake", initialSettings.stake),
    stopLoss: readNumber(record, "stopLoss", initialSettings.stopLoss),
    symbol: readString(record, "symbol", initialSettings.symbol),
    takeProfit: readNumber(record, "takeProfit", initialSettings.takeProfit),
    tradeEveryTick: readBoolean(record, "tradeEveryTick", initialSettings.tradeEveryTick),
    tradeType: tradeTypeValue(record.tradeType, initialSettings.tradeType),
  });
}

function normalizeSettings(settings: BotSettings): BotSettings {
  const patch: Partial<BotSettings> = {};
  if (settings.tradeType !== "digits") {
    patch.digitContract = "even_odd";
  }
  if (
    !purchaseDirectionOptions(settings).some((item) => item.value === settings.purchaseDirection)
  ) {
    patch.purchaseDirection = purchaseDirectionOptions(settings)[0]?.value ?? "even";
  }
  const digitContract = patch.digitContract ?? settings.digitContract;
  const purchaseDirection = patch.purchaseDirection ?? settings.purchaseDirection;
  let selectedDigit = Math.max(0, Math.min(9, Math.round(Number(settings.selectedDigit) || 0)));
  if (settings.tradeType === "digits" && digitContract === "over_under") {
    if (purchaseDirection === "over") selectedDigit = Math.min(8, selectedDigit);
    if (purchaseDirection === "under") selectedDigit = Math.max(1, selectedDigit);
  }
  return {
    ...settings,
    ...patch,
    duration: Math.max(1, Math.round(Number(settings.duration) || 1)),
    martingale: clampNumber(settings.martingale, 1, 100),
    maxRuns: Math.max(1, Math.round(Number(settings.maxRuns) || 1)),
    maxStake: clampNumber(settings.maxStake, 0.35, 50000),
    selectedDigit,
    stake: clampNumber(settings.stake, 0.35, 50000),
    stopLoss: Math.max(0, Number(settings.stopLoss) || 0),
    takeProfit: Math.max(0, Number(settings.takeProfit) || 0),
  };
}

function contractFamilyOptions(tradeType: TradeTypeUi) {
  if (tradeType === "digits") {
    return [
      { label: "Even/Odd", value: "even_odd" },
      { label: "Over/Under", value: "over_under" },
      { label: "Matches/Differs", value: "matches_differs" },
    ];
  }
  if (tradeType === "rise_fall") return [{ label: "Rise/Fall", value: "rise_fall" }];
  if (tradeType === "higher_lower") return [{ label: "Higher/Lower", value: "higher_lower" }];
  if (tradeType === "touch_no_touch") return [{ label: "Touch/No Touch", value: "touch_no_touch" }];
  return [{ label: "Multiplier", value: "multiplier" }];
}

function contractFamilyValue(settings: BotSettings) {
  return settings.tradeType === "digits" ? settings.digitContract : settings.tradeType;
}

function contractFamilyPatch(tradeType: TradeTypeUi, value: string): Partial<BotSettings> {
  if (tradeType === "digits") {
    const digitContract = value as DigitContract;
    return {
      digitContract,
      purchaseDirection:
        digitContract === "even_odd"
          ? "even"
          : digitContract === "matches_differs"
            ? "matches"
            : "over",
    };
  }
  return {
    purchaseDirection:
      value === "rise_fall"
        ? "up"
        : value === "higher_lower"
          ? "higher"
          : value === "touch_no_touch"
            ? "touch"
            : "up",
    tradeType: value as TradeTypeUi,
  };
}

function purchaseDirectionOptions(settings: BotSettings) {
  const category = settings.tradeType === "digits" ? settings.digitContract : settings.tradeType;
  if (category === "even_odd") {
    return [
      { label: "Even", value: "even" },
      { label: "Odd", value: "odd" },
    ];
  }
  if (category === "over_under") {
    return [
      { label: "Over", value: "over" },
      { label: "Under", value: "under" },
    ];
  }
  if (category === "matches_differs") {
    return [
      { label: "Matches", value: "matches" },
      { label: "Differs", value: "differs" },
    ];
  }
  if (category === "rise_fall") {
    return [
      { label: "Rise", value: "up" },
      { label: "Fall", value: "down" },
    ];
  }
  if (category === "higher_lower") {
    return [
      { label: "Higher", value: "higher" },
      { label: "Lower", value: "lower" },
    ];
  }
  if (category === "touch_no_touch") {
    return [
      { label: "Touch", value: "touch" },
      { label: "No Touch", value: "no_touch" },
    ];
  }
  return [
    { label: "Multiplier Up", value: "up" },
    { label: "Multiplier Down", value: "down" },
  ];
}

function tradeCategory(settings: BotSettings): TradeCategory {
  if (settings.tradeType === "digits") return settings.digitContract;
  return settings.tradeType;
}

function contractTypeLabel(settings: BotSettings) {
  return `${contractFamilyOptions(settings.tradeType).find((item) => item.value === contractFamilyValue(settings))?.label ?? "Contract"} / ${purchaseDirectionOptions(settings).find((item) => item.value === settings.purchaseDirection)?.label ?? settings.purchaseDirection}`;
}

function proposalInput(settings: BotSettings, stake: number): ProposalInput {
  return {
    barrier:
      tradeCategory(settings) === "higher_lower" || tradeCategory(settings) === "touch_no_touch"
        ? "+0.10"
        : String(settings.selectedDigit),
    currency: settings.currency,
    duration: settings.duration,
    durationUnit: settings.durationUnit,
    market: settings.symbol,
    multiplier: 100,
    payoutMode: "stake",
    selectedDigit: settings.selectedDigit,
    side: settings.purchaseDirection,
    stake,
    stopLoss: settings.stopLoss,
    takeProfit: settings.takeProfit,
    tradeType: tradeCategory(settings),
  };
}

function conditionAllowsTrade(
  settings: BotSettings,
  stake: number,
  runNumber: number,
  totalProfit: number,
) {
  const leftValue =
    settings.conditionLeft === "Total Profit"
      ? totalProfit
      : settings.conditionLeft === "Stake"
        ? stake
        : settings.conditionLeft === "Run Count"
          ? runNumber
          : settings.selectedDigit;
  const rightValue = Number(settings.conditionRight);
  if (settings.conditionOperator === "contains") {
    return settings.conditionRight
      .split(",")
      .map((item) => item.trim())
      .includes(String(leftValue));
  }
  if (!Number.isFinite(rightValue)) return true;
  if (settings.conditionOperator === ">") return leftValue > rightValue;
  if (settings.conditionOperator === "<") return leftValue < rightValue;
  return leftValue === rightValue;
}

async function waitForSettlement(contractId: string): Promise<Settlement> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ entrySpot: null, exitSpot: null, payout: 0, profit: 0, status: "open" });
      void unsubscribe?.();
    }, 45000);

    subscribeOpenContract(contractId, (contract) => {
      const statusText = String(contract.status ?? "").toLowerCase();
      const isSold =
        contract.is_sold === 1 ||
        contract.is_sold === true ||
        contract.is_expired === 1 ||
        contract.is_expired === true ||
        statusText === "won" ||
        statusText === "lost" ||
        statusText === "sold";
      if (!isSold || settled) return;
      settled = true;
      window.clearTimeout(timeout);
      const entrySpot = numberFrom(
        contract.entry_spot,
        contract.entry_tick,
        contract.entry_tick_display_value,
      );
      const exitSpot = numberFrom(
        contract.exit_spot,
        contract.exit_tick,
        contract.exit_tick_display_value,
        contract.sell_spot,
        contract.current_spot,
        contract.current_tick,
        contract.current_spot_display_value,
      );
      const profit = Number(contract.profit ?? 0);
      const payout = Number(contract.payout ?? contract.sell_price ?? contract.bid_price ?? 0);
      resolve({
        entrySpot,
        exitSpot,
        payout: Number.isFinite(payout) ? payout : 0,
        profit: Number.isFinite(profit) ? profit : 0,
        status: profit >= 0 ? "won" : "lost",
      });
      void unsubscribe?.();
    })
      .then((off) => {
        unsubscribe = off;
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function shouldRetryBotTrade(error: unknown) {
  const message = getDerivTradingErrorMessage(error).toLowerCase();
  const code = String((error as { code?: unknown })?.code ?? "").toLowerCase();
  return (
    message.includes(DERIV_TEMPORARY_PROCESSING_MESSAGE.toLowerCase()) ||
    message.includes("timed out") ||
    code.includes("internal") ||
    code.includes("rate") ||
    code.includes("timeout")
  );
}

function positiveNumberFrom(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function clampNumber(value: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "saved";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "Imported bot";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, fallback: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function durationUnitValue(value: unknown, fallback: DurationUnit): DurationUnit {
  if (value === "m" || value === "s" || value === "t") return value;
  if (value === "minutes") return "m";
  if (value === "seconds") return "s";
  if (value === "ticks") return "t";
  return fallback;
}

function digitContractValue(value: unknown, fallback: DigitContract): DigitContract {
  if (value === "even_odd" || value === "matches_differs" || value === "over_under") {
    return value;
  }
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("over") || normalized.includes("under")) return "over_under";
  if (normalized.includes("match") || normalized.includes("differ")) return "matches_differs";
  if (normalized.includes("even") || normalized.includes("odd")) return "even_odd";
  return fallback;
}

function tradeTypeValue(value: unknown, fallback: TradeTypeUi): TradeTypeUi {
  if (
    value === "digits" ||
    value === "higher_lower" ||
    value === "multiplier" ||
    value === "rise_fall" ||
    value === "touch_no_touch"
  ) {
    return value;
  }
  return fallback;
}

function conditionJoinValue(value: unknown, fallback: "All" | "Any") {
  return value === "All" || value === "Any" ? value : fallback;
}

function firstFiniteNumber(values: Array<number | string | null | undefined>) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function firstXmlFieldText(document: Document, names: string[]) {
  for (const name of names) {
    const field = document.querySelector(`field[name="${name}"]`);
    const value = field?.textContent?.trim();
    if (value) return value;
  }
  return undefined;
}

function firstXmlNumberFromVariable(document: Document, variableHints: string[]) {
  const variables = Array.from(document.querySelectorAll('block[type="variables_set"]'));
  for (const block of variables) {
    const variableName = block.querySelector('field[name="VAR"]')?.textContent?.trim() ?? "";
    const normalizedName = variableName.toLowerCase();
    if (!variableHints.some((hint) => normalizedName.includes(hint))) continue;
    const value =
      block.querySelector('value[name="VALUE"] field[name="NUM"]')?.textContent?.trim() ??
      block.querySelector('field[name="NUM"]')?.textContent?.trim();
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}
