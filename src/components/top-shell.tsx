import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AiAssistant } from "@/components/ai-assistant";
import {
  BotRunMonitorPanel,
} from "@/components/bot-run-monitor";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { useBotRunner } from "@/context/bot-runner-context";
import { useTheme } from "@/hooks/use-theme";
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
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { type DerivAccount } from "@/hooks/use-deriv-balance";
import { isDemoAccount } from "@/lib/deriv-account";

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
  const runner = useBotRunner();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeAccountTab, setActiveAccountTab] = useState<"real" | "demo">("real");
  const [botMonitorCollapsed, setBotMonitorCollapsed] = useState(true);
  const [botMonitorTab, setBotMonitorTab] = useState("summary");

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

  // Auto-expand footer monitor when a bot starts running (e.g. from the bot-builder page).
  useEffect(() => {
    if (runner.status === "running") {
      setBotMonitorCollapsed(false);
      setBotMonitorTab("summary");
    }
  }, [runner.status]);


  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "signin" } });
  }

  function handleDeposit() {
    window.open("https://app.deriv.com/cashier/deposit", "_blank", "noopener,noreferrer");
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

  async function handleFooterBotRun() {
    if (runner.status !== "running") setBotMonitorTab("summary");
    await runner.startBot();
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
                          Your accounts
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
                          Total balance across your accounts.
                        </div>
                      </div>
                    </div>
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

          {user && !account && !balanceLoading && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex items-center gap-1.5 rounded-full border border-[#d6d6d6] bg-white px-3 py-1.5 text-sm font-medium text-[#333333] transition hover:bg-[#f2f3f4] dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:text-[#e6e6e6] dark:hover:bg-[#222]"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
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
          connecting={runner.connecting}
          currency={currency || account?.currency || "USD"}
          journal={runner.journal}
          mode="footer"
          onReset={runner.resetRunner}
          onRun={handleFooterBotRun}
          onToggleCollapse={() => setBotMonitorCollapsed((value) => !value)}
          setActiveTab={setBotMonitorTab}
          stats={runner.stats}
          status={runner.status}
          title="Bot monitor"
          transactions={runner.transactions}
        />
      )}

      {showAssistantButton && (
        <AiAssistant currentPath={pathname} showBotMonitor={showBotMonitor} />
      )}
    </div>
  );
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
