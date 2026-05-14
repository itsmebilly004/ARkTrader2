import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AiAssistant } from "@/components/ai-assistant";
import {
  BotRunMonitorPanel,
  DEFAULT_BOT_MONITOR_JOURNAL,
  EMPTY_BOT_MONITOR_STATS,
  type BotMonitorJournalEntry,
  type BotMonitorStats,
  type BotMonitorStatus,
  type BotMonitorTransaction,
} from "@/components/bot-run-monitor";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { useTheme } from "@/hooks/use-theme";
import {
  persistBotMonitorSnapshot,
  readBotMonitorSnapshot,
  updateTrackedTrade,
  upsertTrackedTrade,
} from "@/lib/activity-memory";
import {
  ensureDerivTradingConnection,
  getDerivTradingErrorMessage,
  type TradeCategory,
  type TradingAdapter,
  disconnectAll,
} from "@/lib/deriv";
import { resolveRunnableBotSettings, type BotBuilderSettings } from "@/lib/bot-builder-state";
import { buyProposal, requestProposal, subscribeOpenContract } from "@/lib/deriv-trading-service";
import { buildStandardProposalPayload, type ProposalInput } from "@/lib/trade-proposal-builder";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LayoutGrid,
  Bot,
  LineChart as LineChartIcon,
  BarChart3,
  Cpu,
  Microscope,
  Target,
  Users,
  ChevronDown,
  LogOut,
  ChevronUp,
  RefreshCw,
  Moon,
  Sun,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type DerivAccount } from "@/hooks/use-deriv-balance";
import { numberFrom } from "@/lib/contract-state";
import { hasDerivAccountPrefix, isDemoAccount } from "@/lib/deriv-account";

const CURRENCY_META: Record<string, { country?: string; name: string; symbol?: string }> = {
  AUD: { country: "au", name: "Australian Dollar" },
  BTC: { name: "Bitcoin", symbol: "B" },
  ETH: { name: "Ethereum", symbol: "E" },
  EUR: { country: "eu", name: "Euro" },
  GBP: { country: "gb", name: "British Pound" },
  LTC: { name: "Litecoin", symbol: "L" },
  tUSDT: { name: "Tether TRC20", symbol: "T" },
  USDC: { name: "USD Coin", symbol: "$" },
  USDT: { name: "Tether", symbol: "T" },
  USD: { country: "us", name: "US Dollar" },
};

function currencyMeta(currency?: string | null) {
  return CURRENCY_META[currency ?? ""] ?? { name: currency || "Trading account" };
}

function formatBalance(value?: number | null, currency?: string | null) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${currency ? ` ${currency}` : ""}`;
}

function totalAssetsLabel(accounts: DerivAccount[]) {
  const totals = accounts.reduce<Record<string, number>>((acc, account) => {
    const currency = account.currency || "USD";
    acc[currency] = (acc[currency] ?? 0) + Number(account.balance ?? 0);
    return acc;
  }, {});
  const entries = Object.entries(totals);
  if (!entries.length) return "0.00 USD";
  return entries.map(([assetCurrency, amount]) => formatBalance(amount, assetCurrency)).join(" + ");
}

function accountDisplayName(account: Pick<DerivAccount, "currency" | "label" | "is_demo" | "is_virtual" | "account_type">) {
  if (isDemoAccount(account)) return "Demo";
  const meta = currencyMeta(account.currency);
  return meta.name || account.label || "Real account";
}

type TabDef = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
};

export const TOP_TABS: TabDef[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/bot-builder", label: "Bot Builder", icon: Bot },
  { to: "/", label: "Manual Traders", icon: LineChartIcon },
  { to: "/charts", label: "Charts", icon: BarChart3 },
  { to: "/trading-bots", label: "Trading Bots", icon: Cpu },
  { to: "/analysis", label: "Analysis Tool", icon: Microscope },
  { to: "/strategies", label: "Strategies", icon: Target },
  { to: "/copy-trading", label: "Copy Trading", icon: Users },
];

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

export function TopShell({
  children,
  showAssistantButton = true,
  showBotMonitor = true,
}: {
  children: ReactNode;
  showAssistantButton?: boolean;
  showBotMonitor?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { account, accounts, balance, currency, loading: balanceLoading, refreshing, refreshBalances, switchAccount } =
    useDerivBalanceContext();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeAccountTab, setActiveAccountTab] = useState<"real" | "demo">("real");
  const [botMonitorCollapsed, setBotMonitorCollapsed] = useState(true);
  const [botMonitorTab, setBotMonitorTab] = useState("summary");
  const [botMonitorStatus, setBotMonitorStatus] = useState<BotMonitorStatus>("stopped");
  const [botMonitorStats, setBotMonitorStats] = useState<BotMonitorStats>(EMPTY_BOT_MONITOR_STATS);
  const [botMonitorTransactions, setBotMonitorTransactions] = useState<BotMonitorTransaction[]>([]);
  const [botMonitorJournal, setBotMonitorJournal] = useState<BotMonitorJournalEntry[]>(
    DEFAULT_BOT_MONITOR_JOURNAL,
  );
  const [botMonitorMemoryReady, setBotMonitorMemoryReady] = useState(false);
  const footerBotRunningRef = useRef(false);
  const footerBotStatsRef = useRef(EMPTY_BOT_MONITOR_STATS);

  const realAccounts = useMemo(
    () => accounts.filter((account) => account.normalizedType === "real"),
    [accounts],
  );
  const demoAccounts = useMemo(
    () => accounts.filter((account) => account.normalizedType === "demo"),
    [accounts],
  );
  const visibleAccounts = activeAccountTab === "real" ? realAccounts : demoAccounts;

  useEffect(() => {
    if (!account || dropdownOpen) return;
    if (account.normalizedType !== "real" && account.normalizedType !== "demo") return;
    setActiveAccountTab(account.normalizedType);
  }, [account, dropdownOpen]);

  useEffect(() => {
    footerBotStatsRef.current = botMonitorStats;
  }, [botMonitorStats]);

  useEffect(() => {
    const snapshot = readBotMonitorSnapshot(user?.id);
    if (!snapshot) {
      setBotMonitorStatus("stopped");
      setBotMonitorStats(EMPTY_BOT_MONITOR_STATS);
      setBotMonitorTransactions([]);
      setBotMonitorJournal(DEFAULT_BOT_MONITOR_JOURNAL);
      setBotMonitorMemoryReady(true);
      return;
    }
    setBotMonitorStatus(snapshot.status);
    setBotMonitorStats(snapshot.stats);
    setBotMonitorTransactions(snapshot.transactions);
    setBotMonitorJournal(snapshot.journal.length ? snapshot.journal : DEFAULT_BOT_MONITOR_JOURNAL);
    setBotMonitorMemoryReady(true);
  }, [user?.id]);

  useEffect(() => {
    if (!botMonitorMemoryReady) return;
    persistBotMonitorSnapshot(user?.id, {
      journal: botMonitorJournal,
      stats: botMonitorStats,
      status: botMonitorStatus,
      transactions: botMonitorTransactions,
      updatedAt: new Date().toISOString(),
    });
  }, [
    botMonitorJournal,
    botMonitorMemoryReady,
    botMonitorStats,
    botMonitorStatus,
    botMonitorTransactions,
    user?.id,
  ]);

  useEffect(() => {
    console.info(
      "[Deriv Accounts] dropdown normalized account placement",
      accounts.map((item) => ({
        raw_account_id: item.account_id,
        raw_loginid: item.loginid,
        detected_prefix: item.detected_prefix,
        normalizedType: item.normalizedType,
        final_tab_placement: item.final_tab_placement,
      })),
    );
    console.info("[Deriv Accounts] dropdown realAccounts", realAccounts);
    console.info("[Deriv Accounts] dropdown demoAccounts", demoAccounts);
    console.info("[Deriv Accounts] dropdown selectedAccount", account);
    console.assert(
      realAccounts.every((item) => item.normalizedType === "real"),
      "[Deriv Accounts] Real tab contains a non-real account",
      realAccounts,
    );
    console.assert(
      demoAccounts.every((item) => item.normalizedType === "demo"),
      "[Deriv Accounts] Demo tab contains a non-demo account",
      demoAccounts,
    );
    console.assert(
      realAccounts.every((item) => !hasDerivAccountPrefix(item, "DOT")),
      "[Deriv Accounts] Real tab contains a DOT demo account",
      realAccounts,
    );
    console.assert(
      demoAccounts.every((item) => !hasDerivAccountPrefix(item, "ROT")),
      "[Deriv Accounts] Demo tab contains a ROT real account",
      demoAccounts,
    );
    const unknownAccounts = accounts.filter((item) => item.normalizedType === "unknown");
    if (unknownAccounts.length) {
      console.warn(
        "[Deriv Accounts] unknown accounts not rendered in account tabs",
        unknownAccounts,
      );
    }
  }, [account, accounts, demoAccounts, realAccounts]);

  async function handleLogout() {
    if (user) {
      await supabase.from("sessions").update({ is_active: false }).eq("user_id", user.id);
    }
    disconnectAll();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" } });
  }

  async function handleRefreshBalances() {
    try {
      await refreshBalances("manual-dropdown");
      toast.success("Balances refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh balances.";
      toast.error(message);
    }
  }

  function handleDeposit() {
    toast.info("This is a simulated account. Deposits are not required.");
  }

  function addFooterBotJournal(
    message: string,
    type: BotMonitorJournalEntry["type"] = "info",
  ) {
    setBotMonitorJournal((current) => [
      { id: crypto.randomUUID(), message, time: formatTime(), type },
      ...current,
    ]);
  }

  function resetFooterBotMonitor() {
    footerBotRunningRef.current = false;
    setBotMonitorStatus("stopped");
    setBotMonitorStats(EMPTY_BOT_MONITOR_STATS);
    setBotMonitorTransactions([]);
    setBotMonitorJournal(DEFAULT_BOT_MONITOR_JOURNAL);
    setBotMonitorTab("summary");
  }

  async function handleFooterBotRun() {
    if (botMonitorStatus === "running") {
      footerBotRunningRef.current = false;
      setBotMonitorStatus("stopped");
      addFooterBotJournal(
        "Stop requested. The bot will stop after the current contract settles.",
        "warning",
      );
      return;
    }

    const settings = resolveRunnableBotSettings(user?.id);
    if (!settings) {
      navigate({ to: "/bot-builder" });
      return;
    }

    if (!account) {
      toast.error("Connect and select a Deriv account before running the bot.");
      addFooterBotJournal("Run blocked: no Deriv account selected.", "error");
      return;
    }

    footerBotRunningRef.current = true;
    setBotMonitorStatus("running");
    setBotMonitorTab("summary");
    setBotMonitorCollapsed(false);
    addFooterBotJournal("Bot run started.", "success");

    try {
      const session = await ensureDerivTradingConnection(account, { context: "footer-bot-run" });
      const runCurrency = currency || account.currency || settings.currency;
      const context = {
        adapter: session.adapter,
        contractType: contractTypeLabel(settings),
        selectedAccountId: session.account_id,
        selectedAccountType: session.normalizedType,
      };
      let currentStake = settings.stake;
      let runningProfit = footerBotStatsRef.current.totalProfitLoss;

      for (let index = 0; footerBotRunningRef.current && index < settings.maxRuns; index += 1) {
        const snapshot = { ...settings, currency: runCurrency };
        const stake = clampNumber(currentStake, 0.35, snapshot.maxStake);
        if (!conditionAllowsTrade(snapshot, stake, index + 1, runningProfit)) {
          addFooterBotJournal(
            "Purchase condition is false. Waiting for the next run cycle.",
            "warning",
          );
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
            const payload = buildStandardProposalPayload(input, session.adapter as TradingAdapter);
            addFooterBotJournal(
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
            setBotMonitorTransactions((items) => [record, ...items]);
            upsertTrackedTrade(user?.id, {
              contractId,
              contractType: String(payload.contract_type ?? context.contractType),
              currency: snapshot.currency,
              id: record.id,
              market: snapshot.symbol,
              openedAt: new Date().toISOString(),
              payout: 0,
              profitLoss: 0,
              source: "bot-footer",
              stake,
              status: "open",
            });
            addFooterBotJournal(`Bought contract ${contractId}. Waiting for settlement.`, "success");
            settlement = await waitForSettlement(contractId);

            setBotMonitorTransactions((items) =>
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
              addFooterBotJournal(
                "Deriv returned a temporary processing error. Retrying once.",
                "warning",
              );
              await sleep(1500);
              continue;
            }
            break;
          }
        }

        if (!settlement) {
          const message = getDerivTradingErrorMessage(tradeError);
          if (snapshot.restartBuySellOnError || snapshot.restartLastTradeOnError) {
            addFooterBotJournal(
              `Skipped one bot run after Deriv rejected the trade: ${message}`,
              "warning",
            );
            await sleep(700);
            continue;
          }
          throw tradeError;
        }

        runningProfit += settlement.profit;
        setBotMonitorStats((current) => ({
          contractsLost: current.contractsLost + (settlement.status === "lost" ? 1 : 0),
          contractsWon: current.contractsWon + (settlement.status === "won" ? 1 : 0),
          runs: current.runs + 1,
          totalPayout: current.totalPayout + settlement.payout,
          totalProfitLoss: current.totalProfitLoss + settlement.profit,
          totalStake: current.totalStake + stake,
        }));
        addFooterBotJournal(
          `Contract settled ${settlement.status}. P/L ${settlement.profit.toFixed(2)} ${snapshot.currency}.`,
          settlement.status === "won"
            ? "success"
            : settlement.status === "lost"
              ? "warning"
              : "info",
        );
        await refreshBalances("footer-bot-trade-complete", account.account_id).catch((error) => {
          console.warn("[Top Shell] balance refresh after settled trade failed", error);
        });

        if (runningProfit >= snapshot.takeProfit || runningProfit <= -Math.abs(snapshot.stopLoss)) {
          addFooterBotJournal("Profit or loss threshold reached. Bot stopped.", "warning");
          break;
        }
        currentStake =
          settlement.status === "lost"
            ? clampNumber(stake * snapshot.martingale, 0.35, snapshot.maxStake)
            : snapshot.stake;
        if (!snapshot.tradeEveryTick) await sleep(1000);
      }

      await refreshBalances("footer-bot-run-complete", account.account_id).catch((error) => {
        console.warn("[Top Shell] final balance refresh after run failed", error);
      });
      setBotMonitorStatus("stopped");
      footerBotRunningRef.current = false;
      addFooterBotJournal("Bot run completed.", "success");
    } catch (error) {
      const message = getDerivTradingErrorMessage(error);
      footerBotRunningRef.current = false;
      setBotMonitorStatus("error");
      addFooterBotJournal(message, "error");
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[#f2f3f4] text-[#333333] dark:bg-[#0e0e0e] dark:text-[#e6e6e6]">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] bg-white px-3 py-2 sm:flex-nowrap md:px-6 dark:border-[#242424] dark:bg-[#151515]">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <BrandLogo
            imageClassName="size-10 rounded-[12px] sm:size-11"
            labelClassName="truncate text-base font-bold tracking-tight text-[#333333] sm:text-lg dark:text-[#e6e6e6]"
          />
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-4">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#d6d6d6] bg-white text-[#333333] transition hover:bg-[#f2f3f4] dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:text-[#e6e6e6] dark:hover:bg-[#222]"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {user && account && (
            <>
              <Button
                onClick={handleDeposit}
                className="hidden h-9 rounded-md bg-[#ff444f] px-5 text-sm font-bold text-white hover:bg-[#eb3e48] sm:inline-flex"
              >
                Deposit
              </Button>
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="flex min-w-0 max-w-[min(58vw,17rem)] items-center gap-1.5 rounded-full border border-[#d6d6d6] bg-white px-2 py-1.5 transition hover:bg-[#f2f3f4] sm:max-w-full sm:gap-2 sm:px-3 dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:hover:bg-[#222]">
                    <AccountIcon account={account} size="sm" />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-bold tabular-nums text-[#333333] sm:text-sm dark:text-[#e6e6e6]">
                        {formatBalance(balance ?? account.balance, "").trim()}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-[#646464] dark:text-[#b7b7b7]">
                        {currency || account.currency}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 text-[#999999] transition-transform duration-200 dark:text-[#b7b7b7]",
                        dropdownOpen && "rotate-180",
                      )}
                    />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-[min(calc(100vw-1.5rem),380px)] overflow-hidden rounded-lg border border-[#d6d6d6] bg-white p-0 text-[#333333] shadow-xl dark:border-[#2b2b2b] dark:bg-[#151515] dark:text-[#e6e6e6]"
                >
                  <Tabs
                    value={activeAccountTab}
                    onValueChange={(value) => setActiveAccountTab(value as "real" | "demo")}
                    className="w-full"
                  >
                    <TabsList className="grid h-12 w-full grid-cols-2 rounded-none border-b border-[#eeeeee] bg-white p-0 dark:border-[#2b2b2b] dark:bg-[#151515]">
                      <TabsTrigger
                        value="real"
                        className="h-full rounded-none border-b-2 border-transparent text-sm font-bold text-[#646464] shadow-none data-[state=active]:border-[#ff444f] data-[state=active]:bg-transparent data-[state=active]:text-[#333333] data-[state=active]:shadow-none dark:text-[#b7b7b7] dark:data-[state=active]:text-[#f2f2f2]"
                      >
                        Real
                      </TabsTrigger>
                      <TabsTrigger
                        value="demo"
                        className="h-full rounded-none border-b-2 border-transparent text-sm font-bold text-[#646464] shadow-none data-[state=active]:border-[#ff444f] data-[state=active]:bg-transparent data-[state=active]:text-[#333333] data-[state=active]:shadow-none dark:text-[#b7b7b7] dark:data-[state=active]:text-[#f2f2f2]"
                      >
                        Demo
                      </TabsTrigger>
                    </TabsList>

                    <div className="px-4 pb-2 pt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-[#333333] dark:text-[#f2f2f2]">
                          Deriv accounts
                        </span>
                        <ChevronUp className="size-4 text-[#333333] dark:text-[#f2f2f2]" />
                      </div>

                      <TabsContent value="real" className="mt-0 space-y-1">
                        <AccountList
                          accounts={realAccounts}
                          activeAccountId={account.account_id}
                          emptyText="No real accounts linked."
                          onSelect={(accountId) => {
                            switchAccount(accountId);
                            setDropdownOpen(false);
                          }}
                        />
                      </TabsContent>

                      <TabsContent value="demo" className="mt-0 space-y-1">
                        <AccountList
                          accounts={demoAccounts}
                          activeAccountId={account.account_id}
                          emptyText="No demo accounts linked."
                          onSelect={(accountId) => {
                            switchAccount(accountId);
                            setDropdownOpen(false);
                          }}
                        />
                      </TabsContent>
                    </div>
                  </Tabs>

                  <div className="border-t border-[#eeeeee] bg-white px-4 py-3 dark:border-[#2b2b2b] dark:bg-[#151515]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-[#333333] dark:text-[#f2f2f2]">
                          {totalAssetsLabel(visibleAccounts)}
                        </div>
                        <div className="mt-0.5 text-xs text-[#777777] dark:text-[#b7b7b7]">
                          Total assets in your Deriv accounts.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#eeeeee] bg-[#f9f9f9] px-4 py-3 text-center dark:border-[#2b2b2b] dark:bg-[#101010]">
                    <p className="text-[13px] text-[#333333] dark:text-[#d8d8d8]">
                      Looking for CFD accounts?{" "}
                      <a
                        href="#"
                        className="font-bold text-[#333333] hover:underline dark:text-[#f2f2f2]"
                      >
                        Go to Trader&apos;s Hub
                      </a>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 dark:bg-[#151515]">
                    <Button
                      variant="outline"
                      className="h-9 rounded-md border-[#999999] px-4 text-sm font-bold text-[#333333] hover:bg-[#f2f3f4] dark:border-[#3a3a3a] dark:bg-[#101010] dark:text-[#e6e6e6] dark:hover:bg-[#202020]"
                      onClick={handleRefreshBalances}
                      disabled={refreshing}
                    >
                      <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} />
                      Refresh balances
                    </Button>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-sm font-medium text-[#333333] hover:text-[#ff444f] dark:text-[#e6e6e6] dark:hover:text-[#ff6b73]"
                    >
                      Logout <LogOut className="size-4" />
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {user && !account && balanceLoading && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#d6d6d6] bg-white px-3 py-1.5 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
              <div className="size-5 animate-pulse rounded-full bg-[#e5e5e5] dark:bg-[#333]" />
              <div className="h-3 w-20 animate-pulse rounded bg-[#e5e5e5] dark:bg-[#333]" />
            </div>
          )}

          {!user && (
            <div className="flex gap-1 sm:gap-2">
              <Button variant="ghost" asChild className="h-9 px-3 text-sm font-medium sm:px-4">
                <Link to="/auth" search={{ mode: "signin" }}>
                  Log in
                </Link>
              </Button>
              <Button
                asChild
                className="h-9 bg-[#3e3e3e] px-3 text-sm font-medium text-white shadow-sm sm:px-4"
              >
                <Link to="/auth" search={{ mode: "signup" }}>
                  Sign up
                </Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      <nav className="border-b border-[#e5e5e5] bg-white dark:border-[#242424] dark:bg-[#151515]">
        <div className="flex min-w-0 items-center overflow-x-auto px-1 sm:px-2">
          {TOP_TABS.map((t) => {
            const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-label={t.label}
                className={cn(
                  "flex min-w-max shrink-0 items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors sm:gap-2 sm:px-4 sm:py-3 sm:text-sm",
                  active
                    ? "bg-[#4bb4b3] text-white"
                    : "text-[#333333] hover:bg-[#f2f3f4] dark:text-[#cccccc] dark:hover:bg-[#1f1f1f]",
                )}
              >
                <Icon className="size-4" />
                <span className={cn("whitespace-nowrap", active && "uppercase tracking-wide")}>
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className={cn("flex min-w-0 flex-1 flex-col", showBotMonitor && "pb-14")}>
        {children}
      </main>

      {showBotMonitor && (
        <BotRunMonitorPanel
          activeTab={botMonitorTab}
          collapsed={botMonitorCollapsed}
          currency={currency || account?.currency || "USD"}
          journal={botMonitorJournal}
          mode="footer"
          onReset={resetFooterBotMonitor}
          onRun={handleFooterBotRun}
          onToggleCollapse={() => setBotMonitorCollapsed((value) => !value)}
          setActiveTab={setBotMonitorTab}
          stats={botMonitorStats}
          status={botMonitorStatus}
          title="Bot monitor"
          transactions={botMonitorTransactions}
        />
      )}

      {showAssistantButton && (
        <AiAssistant currentPath={pathname} showBotMonitor={showBotMonitor} />
      )}
    </div>
  );
}

function tradeCategory(settings: BotBuilderSettings): TradeCategory {
  if (settings.tradeType === "digits") return settings.digitContract;
  return settings.tradeType;
}

function contractTypeLabel(settings: BotBuilderSettings) {
  const familyLabel =
    settings.tradeType === "digits"
      ? settings.digitContract === "even_odd"
        ? "Even/Odd"
        : settings.digitContract === "matches_differs"
          ? "Matches/Differs"
          : "Over/Under"
      : settings.tradeType === "higher_lower"
        ? "Higher/Lower"
        : settings.tradeType === "rise_fall"
          ? "Rise/Fall"
          : settings.tradeType === "touch_no_touch"
            ? "Touch/No Touch"
            : "Multiplier";
  const directionLabel =
    settings.purchaseDirection === "odd"
      ? "Odd"
      : settings.purchaseDirection === "even"
        ? "Even"
        : settings.purchaseDirection === "matches"
          ? "Matches"
          : settings.purchaseDirection === "differs"
            ? "Differs"
            : settings.purchaseDirection === "under"
              ? "Under"
              : settings.purchaseDirection === "over"
                ? "Over"
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
  return `${familyLabel} / ${directionLabel}`;
}

function proposalInput(settings: BotBuilderSettings, stake: number): ProposalInput {
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
  settings: BotBuilderSettings,
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

function AccountList({
  accounts,
  activeAccountId,
  emptyText,
  onSelect,
}: {
  accounts: DerivAccount[];
  activeAccountId: string;
  emptyText: string;
  onSelect: (accountId: string) => void;
}) {
  if (!accounts.length) {
    return (
      <div className="py-8 text-center text-xs text-[#999999] dark:text-[#b7b7b7]">{emptyText}</div>
    );
  }

  return (
    <>
      {accounts.map((account) => (
        <AccountItem
          key={account.account_id}
          account={account}
          isActive={activeAccountId === account.account_id}
          onSelect={() => onSelect(account.account_id)}
        />
      ))}
    </>
  );
}

function AccountItem({
  account,
  isActive,
  onSelect,
}: {
  account: DerivAccount;
  isActive: boolean;
  onSelect: () => void;
}) {
  const demo = isDemoAccount(account);
  const meta = currencyMeta(account.currency);
  const displayName = accountDisplayName(account);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-lg p-3 transition-colors",
        isActive
          ? "bg-[#e6e9e9] dark:bg-[#242424]"
          : "bg-transparent hover:bg-[#f2f3f4] dark:hover:bg-[#202020]",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AccountIcon account={account} />
        <div className="min-w-0 text-left leading-tight">
          <div className="truncate text-sm font-bold text-[#333333] dark:text-[#f2f2f2]">
            {displayName}
          </div>
          <div className="truncate text-[11px] font-medium text-[#999999] dark:text-[#b7b7b7]">
            {account.account_id}
          </div>
        </div>
      </div>
      <div className="shrink-0 pl-2 text-right leading-tight sm:pl-3">
        <div className="text-sm font-bold text-[#333333] dark:text-[#f2f2f2]">
          {formatBalance(account.balance, account.currency)}
        </div>
      </div>
    </button>
  );
}

function AccountIcon({
  account,
  size = "md",
}: {
  account: Pick<
    DerivAccount,
    "account_id" | "loginid" | "currency" | "is_demo" | "is_virtual" | "account_type"
  >;
  size?: "sm" | "md";
}) {
  const demo = isDemoAccount(account);
  const meta = currencyMeta(account.currency);
  const box = size === "sm" ? "size-5" : "size-8";
  const text = size === "sm" ? "text-[10px]" : "text-sm";

  if (demo) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-[#ff444f] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
          box,
        )}
        title="Demo account"
      >
        <span className={cn("font-black leading-none", text)}>D</span>
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-white bg-[#85acb0]" />
      </div>
    );
  }

  if (meta.country) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#f2f3f4] bg-white dark:border-[#333] dark:bg-[#101010]",
          box,
        )}
        title={meta.name}
      >
        <img
          src={`https://flagcdn.com/w40/${meta.country}.png`}
          srcSet={`https://flagcdn.com/w80/${meta.country}.png 2x`}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[#d6d6d6] bg-white text-[#333333] dark:border-[#333] dark:bg-[#101010] dark:text-[#f2f2f2]",
        box,
      )}
      title={meta.name}
    >
      <span className={cn("font-bold leading-none", text)}>
        {meta.symbol ?? account.currency?.slice(0, 1) ?? "$"}
      </span>
    </div>
  );
}

export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-3 py-6 sm:px-4 sm:py-10 md:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-[#646464] dark:text-[#b7b7b7]">{subtitle}</p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}
