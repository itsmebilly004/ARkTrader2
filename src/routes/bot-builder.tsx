import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BotBuilder } from "@/external/bot-builder/BotBuilder";
import { getBlocklyRuntime, getDerivWorkspace } from "@/external/bot-builder/blockly-runtime";
import {
  extractSettingsFromXmlText,
  readSavedWorkspaceXml,
} from "@/external/bot-builder/workspace-persistence";
import { TopShell } from "@/components/top-shell";
import {
  BotRunMonitorPanel,
  type BotMonitorJournalEntry,
  type BotMonitorStats,
  type BotMonitorStatus,
  type BotMonitorTransaction,
} from "@/components/bot-run-monitor";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { useAuth } from "@/hooks/use-auth";
import {
  persistBotMonitorSnapshot,
  updateTrackedTrade,
  upsertTrackedTrade,
} from "@/lib/activity-memory";
import { getDerivTradingErrorMessage, type TradeCategory } from "@/lib/deriv";
import {
  initialBotBuilderSettings,
  resolveRunnableBotSettings,
  type BotBuilderSettings,
} from "@/lib/bot-builder-state";
import { buyProposal, requestProposal, subscribeOpenContract } from "@/lib/deriv-trading-service";
import { buildStandardProposalPayload, type ProposalInput } from "@/lib/trade-proposal-builder";
import { numberFrom } from "@/lib/contract-state";

const search = z.object({
  preset: z.string().optional(),
});

export const Route = createFileRoute("/bot-builder")({
  component: BotBuilderPage,
  validateSearch: search,
  ssr: false,
});

const BOT_TRADE_MAX_ATTEMPTS = 2;
const DERIV_TEMPORARY_PROCESSING_MESSAGE =
  "Sorry, an error occurred while processing your request.";

type BotStatus = BotMonitorStatus;
type Transaction = BotMonitorTransaction;
type JournalEntry = BotMonitorJournalEntry;
type BotStats = BotMonitorStats;
type Settlement = {
  entrySpot: number | null;
  exitSpot: number | null;
  payout: number;
  profit: number;
  status: "lost" | "open" | "won";
};

function tradeCategory(settings: BotBuilderSettings): TradeCategory {
  if (settings.tradeType === "digits") return settings.digitContract;
  return settings.tradeType;
}

function contractTypeLabel(settings: BotBuilderSettings): string {
  const { tradeType, digitContract, purchaseDirection } = settings;
  if (tradeType === "digits") {
    const family =
      digitContract === "even_odd"
        ? "Even/Odd"
        : digitContract === "matches_differs"
          ? "Matches/Differs"
          : "Over/Under";
    const dir =
      purchaseDirection === "even"
        ? "Even"
        : purchaseDirection === "odd"
          ? "Odd"
          : purchaseDirection === "matches"
            ? "Matches"
            : purchaseDirection === "differs"
              ? "Differs"
              : purchaseDirection === "over"
                ? "Over"
                : "Under";
    return `${family} / ${dir}`;
  }
  if (tradeType === "rise_fall")
    return purchaseDirection === "up" ? "Rise/Fall / Rise" : "Rise/Fall / Fall";
  if (tradeType === "higher_lower")
    return purchaseDirection === "higher" ? "Higher/Lower / Higher" : "Higher/Lower / Lower";
  if (tradeType === "touch_no_touch")
    return purchaseDirection === "touch"
      ? "Touch/No Touch / Touch"
      : "Touch/No Touch / No Touch";
  return `Multiplier / ${purchaseDirection}`;
}

function proposalInput(settings: BotBuilderSettings, stake: number): ProposalInput {
  const category = tradeCategory(settings);
  return {
    barrier:
      category === "higher_lower" || category === "touch_no_touch"
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
    tradeType: category,
  };
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

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

function getCurrentWorkspaceSettings(userId: string | null | undefined): BotBuilderSettings {
  // Try live Blockly workspace first
  let xmlText = "";
  try {
    const workspace = getDerivWorkspace();
    const B = getBlocklyRuntime();
    if (workspace && B?.Xml?.workspaceToDom && B.Xml.domToText) {
      const xmlDom = B.Xml.workspaceToDom(workspace);
      xmlText = B.Xml.domToText(xmlDom);
    }
  } catch {
    // ignore
  }
  // Fall back to saved localStorage XML
  if (!xmlText) {
    xmlText =
      readSavedWorkspaceXml(userId) ?? readSavedWorkspaceXml(null) ?? "";
  }
  const savedSettings = resolveRunnableBotSettings(userId) ?? undefined;
  if (xmlText) {
    const extracted = extractSettingsFromXmlText(xmlText, savedSettings);
    if (extracted) return extracted;
  }
  return savedSettings ?? { ...initialBotBuilderSettings };
}

function BotBuilderPage() {
  const { user } = useAuth();
  const { account, currency: accountCurrency, refreshBalances } = useDerivBalanceContext();
  const [status, setStatus] = useState<BotStatus>("stopped");
  const [activeTab, setActiveTab] = useState("summary");
  const [monitorCollapsed, setMonitorCollapsed] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([
    {
      id: "ready",
      message:
        "Bot builder is ready. Build your strategy with Blockly blocks, then press Run.",
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
  const runningRef = useRef(false);
  const currentSettingsRef = useRef<BotBuilderSettings>(initialBotBuilderSettings);

  useEffect(() => {
    persistBotMonitorSnapshot(user?.id, {
      journal,
      stats,
      status,
      transactions,
      updatedAt: new Date().toISOString(),
    });
  }, [journal, stats, status, transactions, user?.id]);

  function addJournal(message: string, type: JournalEntry["type"] = "info") {
    setJournal((current) => [
      { id: crypto.randomUUID(), message, time: formatTime(), type },
      ...current,
    ]);
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

    const snapshot = getCurrentWorkspaceSettings(user.id);
    currentSettingsRef.current = snapshot;

    runningRef.current = true;
    setStatus("running");
    setActiveTab("summary");
    addJournal("Bot run started.", "success");

    try {
      const runCurrency = accountCurrency || account.currency || snapshot.currency;
      const context = {
        adapter: "oauth2PkceTradingAdapter" as const,
        contractType: contractTypeLabel(snapshot),
        selectedAccountId: account.account_id,
        selectedAccountType: account.normalizedType,
      };
      let currentStake = snapshot.stake;
      let runningProfit = stats.totalProfitLoss;

      for (
        let index = 0;
        runningRef.current && index < snapshot.maxRuns;
        index += 1
      ) {
        const current = { ...currentSettingsRef.current, currency: runCurrency };
        const stake = clampNumber(currentStake, 0.35, current.maxStake);
        const input = proposalInput(current, stake);

        let settlement: Settlement | null = null;
        let tradeError: unknown = null;

        for (let attempt = 1; attempt <= BOT_TRADE_MAX_ATTEMPTS; attempt += 1) {
          let contractWasBought = false;
          try {
            const payload = buildStandardProposalPayload(input, "oauth2PkceTradingAdapter");
            addJournal(
              `Requesting proposal for ${contractTypeLabel(current)} with ${stake.toFixed(2)} ${current.currency}.`,
            );
            const proposal = await requestProposal(payload, {
              ...context,
              contractType: String(payload.contract_type ?? context.contractType),
            });
            const proposalId = String(proposal.proposal?.id ?? "");
            const askPrice =
              positiveNumberFrom(proposal.proposal?.ask_price, stake) ?? stake;
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
              currency: current.currency,
              id: record.id,
              market: current.symbol,
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
          if (current.restartBuySellOnError || current.restartLastTradeOnError) {
            addJournal(`Skipped one bot run after trade error: ${message}`, "warning");
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
          `Contract settled ${settlement.status}. P/L ${settlement.profit.toFixed(2)} ${current.currency}.`,
          settlement.status === "won"
            ? "success"
            : settlement.status === "lost"
              ? "warning"
              : "info",
        );
        await refreshBalances("bot-builder-trade-complete", account.account_id).catch(
          (err) => {
            console.warn("[Bot Builder] balance refresh failed", err);
          },
        );

        if (
          (current.takeProfit > 0 && runningProfit >= current.takeProfit) ||
          (current.stopLoss > 0 && runningProfit <= -Math.abs(current.stopLoss))
        ) {
          addJournal("Profit or loss threshold reached. Bot stopped.", "warning");
          break;
        }
        currentStake =
          settlement.status === "lost"
            ? clampNumber(stake * current.martingale, 0.35, current.maxStake)
            : current.stake;
        await sleep(1000);
      }

      await refreshBalances("bot-builder-run-complete", account.account_id).catch((err) => {
        console.warn("[Bot Builder] final balance refresh failed", err);
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
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <BotBuilder />
        </div>
        <BotRunMonitorPanel
          activeTab={activeTab}
          collapsed={monitorCollapsed}
          currency={currentSettingsRef.current.currency}
          journal={journal}
          onReset={resetBot}
          onRun={runBot}
          onToggleCollapse={() => setMonitorCollapsed((v) => !v)}
          setActiveTab={setActiveTab}
          stats={stats}
          status={status}
          transactions={transactions}
        />
      </div>
    </TopShell>
  );
}
