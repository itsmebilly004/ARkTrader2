import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import {
  resolveRunnableBotSettings,
  type BotBuilderSettings,
} from "@/lib/bot-builder-state";
import {
  persistBotMonitorSnapshot,
  readBotMonitorSnapshot,
  updateTrackedTrade,
  upsertTrackedTrade,
} from "@/lib/activity-memory";
import {
  ensureDerivTradingConnection,
  getDerivTradingErrorMessage,
  type TradingAdapter,
  type TradeCategory,
} from "@/lib/deriv";
import { buyProposal, requestProposal, subscribeOpenContract } from "@/lib/deriv-trading-service";
import { buildStandardProposalPayload } from "@/lib/trade-proposal-builder";
import { numberFrom } from "@/lib/contract-state";
import {
  DEFAULT_BOT_MONITOR_JOURNAL,
  EMPTY_BOT_MONITOR_STATS,
  type BotMonitorJournalEntry,
  type BotMonitorStats,
  type BotMonitorStatus,
  type BotMonitorTransaction,
} from "@/components/bot-run-monitor";

const BOT_TRADE_MAX_ATTEMPTS = 2;
const DERIV_TEMPORARY_PROCESSING_MESSAGE =
  "Sorry, an error occurred while processing your request.";

type Settlement = {
  entrySpot: number | null;
  exitSpot: number | null;
  payout: number;
  profit: number;
  status: "lost" | "open" | "won";
};

export type BotRunnerState = {
  connecting: boolean;
  journal: BotMonitorJournalEntry[];
  resetRunner: () => void;
  startBot: () => Promise<void>;
  stats: BotMonitorStats;
  status: BotMonitorStatus;
  transactions: BotMonitorTransaction[];
};

const BotRunnerContext = createContext<BotRunnerState | null>(null);

export function useBotRunner(): BotRunnerState {
  const ctx = useContext(BotRunnerContext);
  if (!ctx) throw new Error("useBotRunner must be used within BotRunnerProvider");
  return ctx;
}

function tradeCategory(settings: BotBuilderSettings): TradeCategory {
  if (settings.tradeType === "digits") return settings.digitContract;
  return settings.tradeType;
}

function contractTypeLabel(settings: BotBuilderSettings): string {
  const family =
    settings.tradeType === "digits"
      ? settings.digitContract === "even_odd"
        ? "Even/Odd"
        : settings.digitContract === "matches_differs"
          ? "Matches/Differs"
          : "Over/Under"
      : settings.tradeType === "rise_fall"
        ? "Rise/Fall"
        : settings.tradeType === "higher_lower"
          ? "Higher/Lower"
          : settings.tradeType === "touch_no_touch"
            ? "Touch/No Touch"
            : "Multiplier";
  const dir =
    settings.purchaseDirection === "even"
      ? "Even"
      : settings.purchaseDirection === "odd"
        ? "Odd"
        : settings.purchaseDirection === "matches"
          ? "Matches"
          : settings.purchaseDirection === "differs"
            ? "Differs"
            : settings.purchaseDirection === "over"
              ? "Over"
              : settings.purchaseDirection === "under"
                ? "Under"
                : settings.purchaseDirection === "higher"
                  ? "Higher"
                  : settings.purchaseDirection === "lower"
                    ? "Lower"
                    : settings.purchaseDirection === "touch"
                      ? "Touch"
                      : settings.purchaseDirection === "no_touch"
                        ? "No Touch"
                        : settings.purchaseDirection === "up"
                          ? "Rise"
                          : settings.purchaseDirection === "down"
                            ? "Fall"
                            : settings.purchaseDirection;
  return `${family} / ${dir}`;
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function clampNumber(value: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BotRunnerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { account, currency, refreshBalances } = useDerivBalanceContext();

  const [status, setStatus] = useState<BotMonitorStatus>("stopped");
  const [connecting, setConnecting] = useState(false);
  const [stats, setStats] = useState<BotMonitorStats>(EMPTY_BOT_MONITOR_STATS);
  const [transactions, setTransactions] = useState<BotMonitorTransaction[]>([]);
  const [journal, setJournal] = useState<BotMonitorJournalEntry[]>(DEFAULT_BOT_MONITOR_JOURNAL);
  const [memoryReady, setMemoryReady] = useState(false);

  const runningRef = useRef(false);
  const interRunDelayResolveRef = useRef<(() => void) | null>(null);
  const statsRef = useRef<BotMonitorStats>(EMPTY_BOT_MONITOR_STATS);

  // Keep statsRef in sync for the run loop to read without stale closure issues.
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // Restore snapshot on mount / user change.
  useEffect(() => {
    const snapshot = readBotMonitorSnapshot(user?.id);
    if (!snapshot) {
      setStatus("stopped");
      setStats(EMPTY_BOT_MONITOR_STATS);
      setTransactions([]);
      setJournal(DEFAULT_BOT_MONITOR_JOURNAL);
    } else {
      // Never restore a "running" status — bot is not actually executing after a mount.
      setStatus(snapshot.status === "running" ? "stopped" : snapshot.status);
      setStats(snapshot.stats);
      setTransactions(snapshot.transactions);
      setJournal(snapshot.journal.length ? snapshot.journal : DEFAULT_BOT_MONITOR_JOURNAL);
    }
    setMemoryReady(true);
  }, [user?.id]);

  // Persist snapshot whenever state changes.
  useEffect(() => {
    if (!memoryReady) return;
    persistBotMonitorSnapshot(user?.id, {
      journal,
      stats,
      status,
      transactions,
      updatedAt: new Date().toISOString(),
    });
  }, [journal, memoryReady, stats, status, transactions, user?.id]);

  function addJournal(message: string, type: BotMonitorJournalEntry["type"] = "info") {
    setJournal((prev) => [
      { id: crypto.randomUUID(), message, time: formatTime(), type },
      ...prev,
    ]);
  }

  const resetRunner = useCallback(() => {
    runningRef.current = false;
    setStatus("stopped");
    setStats(EMPTY_BOT_MONITOR_STATS);
    setTransactions([]);
    setJournal(DEFAULT_BOT_MONITOR_JOURNAL);
  }, []);

  const startBot = useCallback(async () => {
    if (status === "running") {
      runningRef.current = false;
      interRunDelayResolveRef.current?.();
      interRunDelayResolveRef.current = null;
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
      toast.error("Connect and select a Deriv account before running the bot.");
      addJournal("Run blocked: no Deriv account selected.", "error");
      return;
    }

    // Read settings including any user overrides from the settings panel.
    const settings = resolveRunnableBotSettings(user.id);
    if (!settings) {
      toast.error("No bot settings found. Build a strategy in the Bot Builder first.");
      addJournal("Run blocked: no bot settings found. Open the Bot Builder to set up a strategy.", "error");
      return;
    }

    runningRef.current = true;
    setConnecting(true);
    setStatus("running");
    addJournal("Bot run started.", "success");

    try {
      const session = await ensureDerivTradingConnection(account, { context: "bot-runner" });
      setConnecting(false);
      const runCurrency = currency || account.currency || settings.currency;
      const context = {
        adapter: session.adapter as TradingAdapter,
        contractType: contractTypeLabel(settings),
        selectedAccountId: session.account_id,
        selectedAccountType: session.normalizedType,
      };
      let currentStake = settings.stake;
      let runningProfit = statsRef.current.totalProfitLoss;

      for (let index = 0; runningRef.current && index < settings.maxRuns; index += 1) {
        const snapshot = { ...settings, currency: runCurrency };
        const stake = clampNumber(currentStake, 0.35, snapshot.maxStake);

        const input = {
          barrier:
            tradeCategory(snapshot) === "higher_lower" ||
            tradeCategory(snapshot) === "touch_no_touch"
              ? "+0.10"
              : String(snapshot.selectedDigit),
          currency: snapshot.currency,
          duration: snapshot.duration,
          durationUnit: snapshot.durationUnit,
          market: snapshot.symbol,
          multiplier: 100,
          payoutMode: "stake" as const,
          selectedDigit: snapshot.selectedDigit,
          side: snapshot.purchaseDirection,
          stake,
          stopLoss: snapshot.stopLoss,
          takeProfit: snapshot.takeProfit,
          tradeType: tradeCategory(snapshot),
        };

        let settlement: Settlement | null = null;
        let tradeError: unknown = null;

        for (let attempt = 1; attempt <= BOT_TRADE_MAX_ATTEMPTS; attempt += 1) {
          let contractWasBought = false;
          try {
            const payload = buildStandardProposalPayload(input, context.adapter);
            addJournal(
              `Requesting proposal for ${contractTypeLabel(snapshot)} with ${stake.toFixed(2)} ${snapshot.currency}.`,
            );
            const proposal = await requestProposal(payload, {
              ...context,
              contractType: String(payload.contract_type ?? context.contractType),
            });
            const proposalId = String(proposal.proposal?.id ?? "");
            const askPrice = positiveNumberFrom(proposal.proposal?.ask_price, stake) ?? stake;
            if (!runningRef.current) break;
            const buy = await buyProposal(proposalId, askPrice, {
              ...context,
              contractType: String(payload.contract_type ?? context.contractType),
            });
            const contractId = String(buy.buy?.contract_id ?? "");
            contractWasBought = true;
            const record: BotMonitorTransaction = {
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
            upsertTrackedTrade(user.id, {
              contractId,
              contractType: String(payload.contract_type ?? context.contractType),
              currency: snapshot.currency,
              id: record.id,
              market: snapshot.symbol,
              openedAt: new Date().toISOString(),
              payout: 0,
              profitLoss: 0,
              source: "bot-runner",
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
            updateTrackedTrade(user.id, contractId, {
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
            addJournal(`Skipped one run after trade error: ${message}`, "warning");
            await sleep(700);
            continue;
          }
          throw tradeError;
        }

        runningProfit += settlement.profit;
        setStats((prev) => ({
          contractsLost: prev.contractsLost + (settlement!.status === "lost" ? 1 : 0),
          contractsWon: prev.contractsWon + (settlement!.status === "won" ? 1 : 0),
          runs: prev.runs + 1,
          totalPayout: prev.totalPayout + settlement!.payout,
          totalProfitLoss: prev.totalProfitLoss + settlement!.profit,
          totalStake: prev.totalStake + stake,
        }));
        addJournal(
          `Contract settled ${settlement.status}. P/L ${settlement.profit.toFixed(2)} ${snapshot.currency}.`,
          settlement.status === "won"
            ? "success"
            : settlement.status === "lost"
              ? "warning"
              : "info",
        );
        await refreshBalances("bot-runner-trade-complete", account.account_id).catch((err) => {
          console.warn("[BotRunner] balance refresh failed", err);
        });

        if (
          (snapshot.takeProfit > 0 && runningProfit >= snapshot.takeProfit) ||
          (snapshot.stopLoss > 0 && runningProfit <= -Math.abs(snapshot.stopLoss))
        ) {
          addJournal("Profit or loss threshold reached. Bot stopped.", "warning");
          break;
        }

        currentStake =
          settlement.status === "lost"
            ? clampNumber(stake * snapshot.martingale, 0.35, snapshot.maxStake)
            : snapshot.stake;

        // Interruptible cool-down between trades — gives the user time to click Stop
        // on fast-tick markets (1HZ10V/100V) where settlement can be under 1 second.
        await new Promise<void>((resolve) => {
          interRunDelayResolveRef.current = resolve;
          window.setTimeout(() => {
            interRunDelayResolveRef.current = null;
            resolve();
          }, 1500);
        });
        interRunDelayResolveRef.current = null;
      }

      await refreshBalances("bot-runner-run-complete", account.account_id).catch((err) => {
        console.warn("[BotRunner] final balance refresh failed", err);
      });
      runningRef.current = false;
      setStatus("stopped");
      setConnecting(false);
      addJournal("Bot run completed.", "success");
    } catch (error) {
      const message = getDerivTradingErrorMessage(error);
      runningRef.current = false;
      setConnecting(false);
      setStatus("error");
      addJournal(message, "error");
      toast.error(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user, account, currency, refreshBalances]);

  return (
    <BotRunnerContext.Provider
      value={{ connecting, journal, resetRunner, startBot, stats, status, transactions }}
    >
      {children}
    </BotRunnerContext.Provider>
  );
}
