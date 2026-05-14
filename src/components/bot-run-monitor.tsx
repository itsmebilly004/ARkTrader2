import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type BotMonitorStatus = "error" | "running" | "stopped";

export type BotMonitorStats = {
  contractsLost: number;
  contractsWon: number;
  runs: number;
  totalPayout: number;
  totalProfitLoss: number;
  totalStake: number;
};

export type BotMonitorTransaction = {
  contractId: string;
  entrySpot?: number | null;
  exitSpot?: number | null;
  id: string;
  payout: number;
  profit: number;
  stake: number;
  status: "lost" | "open" | "won";
  time: string;
};

export type BotMonitorJournalEntry = {
  id: string;
  message: string;
  time: string;
  type: "error" | "info" | "success" | "warning";
};

export const EMPTY_BOT_MONITOR_STATS: BotMonitorStats = {
  contractsLost: 0,
  contractsWon: 0,
  runs: 0,
  totalPayout: 0,
  totalProfitLoss: 0,
  totalStake: 0,
};

export const DEFAULT_BOT_MONITOR_JOURNAL: BotMonitorJournalEntry[] = [
  {
    id: "idle",
    message: "Open the bot builder to run a bot and stream live activity here.",
    time: "--:--",
    type: "info",
  },
];

type BotRunMonitorPanelProps = {
  activeTab: string;
  currency: string;
  journal: BotMonitorJournalEntry[];
  onReset?: () => void;
  onRun?: () => void;
  onToggleCollapse?: () => void;
  primaryAction?: ReactNode;
  setActiveTab: (value: string) => void;
  stats: BotMonitorStats;
  status: BotMonitorStatus;
  transactions: BotMonitorTransaction[];
  collapsed?: boolean;
  mode?: "builder" | "footer";
  title?: string;
};

export function BotRunMonitorPanel({
  activeTab,
  collapsed = false,
  currency,
  journal,
  mode = "builder",
  onReset,
  onRun,
  onToggleCollapse,
  primaryAction,
  setActiveTab,
  stats,
  status,
  title = "Bot monitor",
  transactions,
}: BotRunMonitorPanelProps) {
  if (collapsed) {
    return mode === "footer" ? (
      <CollapsedFooterMonitor
        currency={currency}
        onToggleCollapse={onToggleCollapse}
        stats={stats}
        status={status}
        title={title}
      />
    ) : (
      <CollapsedBuilderMonitor
        currency={currency}
        onReset={onReset}
        onRun={onRun}
        onToggleCollapse={onToggleCollapse}
        primaryAction={primaryAction}
        stats={stats}
        status={status}
        title={title}
      />
    );
  }

  return (
    <aside
      className={cn(
        "flex min-w-0 flex-col overflow-hidden border border-[#d8d8d8] bg-white text-[#333333] shadow-sm dark:border-[#2c2c2c] dark:bg-[#151515] dark:text-[#eeeeee]",
        mode === "footer"
          ? "fixed inset-x-2 bottom-2 z-40 max-h-[min(540px,72dvh)] rounded-lg sm:left-auto sm:w-[390px]"
          : "h-[72dvh] min-h-[420px] max-sm:fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-24 max-sm:z-50 max-sm:min-h-0 max-sm:rounded-lg lg:h-auto lg:min-h-0",
      )}
    >
      <div className="flex min-h-[49px] items-center gap-2 bg-[#f7f7f7] pr-2 dark:bg-[#1c1c1c]">
        <div className="shrink-0">
          {primaryAction ?? <RunButton onRun={onRun} status={status} />}
        </div>
        <div className="flex h-[38px] min-w-0 flex-1 flex-col items-center justify-center rounded-[2px] border border-[#cfd2d4] bg-white px-2 dark:border-[#333] dark:bg-[#101010]">
          <div className="max-w-full truncate text-xs font-bold">
            Bot is{" "}
            {status === "running" ? "running" : status === "error" ? "in error" : "not running"}
          </div>
          <div className="mt-2 h-1 w-full rounded-full bg-[#d8d8d8] dark:bg-[#303030]">
            <div
              className={cn(
                "h-1 rounded-full",
                status === "running" && "w-3/4 bg-[#4bb4b3]",
                status === "stopped" && "w-[4px] bg-[#111] dark:bg-[#eeeeee]",
                status === "error" && "w-1/2 bg-[#ff444f]",
              )}
            />
          </div>
        </div>
        {onToggleCollapse && (
          <button
            aria-label="Collapse bot monitor"
            className="flex size-9 shrink-0 items-center justify-center rounded border border-[#d6d6d6] bg-white text-[#333333] transition hover:bg-[#f1f2f3] dark:border-[#333] dark:bg-[#101010] dark:text-[#eeeeee] dark:hover:bg-[#202020]"
            type="button"
            onClick={onToggleCollapse}
          >
            {mode === "footer" ? <ChevronDown className="size-4" /> : null}
            {mode === "builder" ? (
              <>
                <ChevronDown className="size-4 lg:hidden" />
                <ChevronRight className="hidden size-4 lg:block" />
              </>
            ) : null}
          </button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid h-10 w-full grid-cols-3 rounded-none border-b border-[#e5e5e5] bg-white p-0 dark:border-[#2b2b2b] dark:bg-[#151515]">
          {["summary", "transactions", "journal"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="h-full rounded-none border-b-2 border-transparent bg-transparent text-sm font-medium capitalize text-[#444] shadow-none data-[state=active]:border-[#ff444f] data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:shadow-none dark:text-[#e6e6e6]"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent
          value="summary"
          className="m-0 min-h-0 flex-1 bg-white p-3 sm:p-4 dark:bg-[#151515]"
        >
          <div className="flex min-h-36 items-center justify-center bg-[#f1f2f3] px-4 text-center text-sm leading-5 text-[#444] sm:h-[228px] sm:px-8 dark:bg-[#202020] dark:text-[#d8d8d8]">
            <p>
              When you&apos;re ready to trade, hit <strong>Run.</strong>
              <br />
              You&apos;ll be able to track your bot&apos;s
              <br />
              performance here.
            </p>
          </div>

          <div className="bg-[#f1f2f3] pb-4 dark:bg-[#202020]">
            <div className="px-5 pt-4 text-right text-[11px] underline">What&apos;s this?</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 pt-3 text-center sm:grid-cols-3 sm:px-5 sm:gap-y-6">
              <SummaryMetric label="Total stake" value={formatMoney(stats.totalStake, currency)} />
              <SummaryMetric
                label="Total payout"
                value={formatMoney(stats.totalPayout, currency)}
              />
              <SummaryMetric label="No. of runs" value={stats.runs} />
              <SummaryMetric label="Contracts lost" value={stats.contractsLost} />
              <SummaryMetric label="Contracts won" value={stats.contractsWon} />
              <SummaryMetric
                label="Total profit/loss"
                value={formatMoney(stats.totalProfitLoss, currency)}
                valueClassName={summaryProfitLossClassName(stats.totalProfitLoss)}
              />
            </div>
          </div>

          <button
            className="mt-3 hidden h-10 w-full rounded-[3px] border border-[#999] bg-white text-sm font-bold hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-60 sm:block dark:bg-[#151515] dark:hover:bg-[#202020]"
            disabled={!onReset}
            type="button"
            onClick={onReset}
          >
            Reset
          </button>
        </TabsContent>

        <TabsContent value="transactions" className="m-0 min-h-0 flex-1 bg-white dark:bg-[#151515]">
          <ScrollArea className="h-full">
            {transactions.length === 0 ? (
              <EmptyPanel title="No transactions yet" />
            ) : (
              <div className="p-4">
                <div className="overflow-hidden rounded-[4px] border border-[#e5e5e5] bg-[#f8f8f8] dark:border-[#333] dark:bg-[#202020]">
                  <Table className="text-xs">
                    <TableHeader className="bg-[#f3f4f5] dark:bg-[#191919]">
                      <TableRow className="border-[#e5e5e5] hover:bg-transparent dark:border-[#333]">
                        <TableHead className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#777] dark:text-[#b7b7b7]">
                          Type
                        </TableHead>
                        <TableHead className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#777] dark:text-[#b7b7b7]">
                          Entry/Exit spot
                        </TableHead>
                        <TableHead className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-[#777] dark:text-[#b7b7b7]">
                          Buy price and P/L
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow
                          key={transaction.id}
                          className="border-[#e5e5e5] bg-[#f8f8f8] dark:border-[#333] dark:bg-[#202020] dark:hover:bg-[#262626]"
                        >
                          <TableCell className="px-3 py-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-[#333] dark:text-[#eeeeee]">
                                Contract {transaction.contractId}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[#777] dark:text-[#b7b7b7]">
                                <span
                                  className={cn(
                                    "font-bold",
                                    transaction.status === "won" &&
                                      "text-[#078a5b] dark:text-[#42d48c]",
                                    transaction.status === "lost" &&
                                      "text-[#cc2f39] dark:text-[#ff6b73]",
                                  )}
                                >
                                  {transaction.status}
                                </span>
                                <span className="truncate normal-case tracking-normal">
                                  {transaction.time}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <SpotStack transaction={transaction} />
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right">
                            <div className="space-y-1">
                              <div className="font-medium text-[#333] dark:text-[#eeeeee]">
                                {formatMoney(transaction.stake, currency)}
                              </div>
                              <div
                                className={cn(
                                  "font-medium",
                                  profitLossClassName(transaction.profit, transaction.status),
                                )}
                              >
                                {formatSignedMoney(transaction.profit, currency)}
                              </div>
                              <div className="text-[10px] text-[#777] dark:text-[#b7b7b7]">
                                Payout {formatMoney(transaction.payout, currency)}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="journal" className="m-0 min-h-0 flex-1 bg-white dark:bg-[#151515]">
          <ScrollArea className="h-full p-4">
            <div className="space-y-2">
              {journal.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-[4px] border bg-[#f8f8f8] p-3 text-xs dark:bg-[#202020]",
                    entry.type === "error" && "border-[#ff444f] text-[#b4232d] dark:text-[#ff8b92]",
                    entry.type === "success" &&
                      "border-[#4bb4b3] text-[#087a78] dark:text-[#7ee0df]",
                    entry.type === "warning" &&
                      "border-[#f2b84b] text-[#8a5f00] dark:text-[#ffd37a]",
                    entry.type === "info" &&
                      "border-[#e5e5e5] text-[#444] dark:border-[#333] dark:text-[#d8d8d8]",
                  )}
                >
                  <div className="mb-1 font-mono text-[10px] opacity-70">{entry.time}</div>
                  {entry.message}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      <div className="border-t border-[#e5e5e5] bg-white p-3 sm:hidden dark:border-[#2b2b2b] dark:bg-[#151515]">
        <button
          className="h-10 w-full rounded-[3px] border border-[#999] bg-white text-sm font-bold hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#101010] dark:hover:bg-[#202020]"
          disabled={!onReset}
          type="button"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </aside>
  );
}

function RunButton({ onRun, status }: { onRun?: () => void; status: BotMonitorStatus }) {
  return (
    <Button
      className={cn(
        "h-[40px] w-[82px] rounded-none text-base font-bold text-white",
        status === "running"
          ? "bg-[#ff444f] hover:bg-[#ef3f49]"
          : "bg-[#4bb4b3] hover:bg-[#43a5a4]",
      )}
      disabled={!onRun}
      onClick={onRun}
    >
      {status === "running" ? (
        <Square className="mr-1 size-4 fill-white" />
      ) : (
        <Play className="mr-1 size-5 fill-white" />
      )}
      {status === "running" ? "Stop" : "Run"}
    </Button>
  );
}

function CollapsedBuilderMonitor({
  currency,
  onReset,
  onRun,
  onToggleCollapse,
  primaryAction,
  stats,
  status,
  title,
}: {
  currency: string;
  onReset?: () => void;
  onRun?: () => void;
  onToggleCollapse?: () => void;
  primaryAction?: ReactNode;
  stats: BotMonitorStats;
  status: BotMonitorStatus;
  title: string;
}) {
  const summaryClassName = summaryProfitLossClassName(stats.totalProfitLoss);
  return (
    <>
      <aside className="fixed inset-x-2 bottom-2 z-40 flex items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white p-1.5 text-[#333333] shadow-lg lg:hidden dark:border-[#2c2c2c] dark:bg-[#151515] dark:text-[#eeeeee]">
        <div className="shrink-0">{primaryAction ?? <RunButton onRun={onRun} status={status} />}</div>
        <button
          aria-label="Reset bot monitor"
          className="flex h-10 shrink-0 items-center justify-center rounded-md border border-[#d6d6d6] bg-white px-3 text-sm font-bold transition hover:bg-[#f1f2f3] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#333] dark:bg-[#101010] dark:hover:bg-[#202020]"
          disabled={!onReset}
          type="button"
          onClick={onReset}
        >
          Reset
        </button>
        <button
          aria-label="Expand bot monitor"
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-[#d6d6d6] bg-white px-3 text-sm font-bold transition hover:bg-[#f1f2f3] dark:border-[#333] dark:bg-[#101010] dark:hover:bg-[#202020]"
          type="button"
          onClick={onToggleCollapse}
        >
          <ChevronUp className="size-4 shrink-0" />
          <span>Expand</span>
        </button>
      </aside>

      <aside className="hidden h-[72dvh] min-h-[420px] min-w-0 flex-col items-center gap-3 border border-[#d8d8d8] bg-white py-2 text-[#333333] shadow-sm lg:flex lg:h-auto lg:min-h-0 dark:border-[#2c2c2c] dark:bg-[#151515] dark:text-[#eeeeee]">
        <button
          aria-label="Show bot monitor"
          className="flex size-9 items-center justify-center rounded border border-[#d6d6d6] bg-white transition hover:bg-[#f1f2f3] dark:border-[#333] dark:bg-[#101010] dark:hover:bg-[#202020]"
          type="button"
          onClick={onToggleCollapse}
        >
          <ChevronLeft className="size-4" />
        </button>
        <StatusDot status={status} />
        <div className="mt-2 flex flex-1 items-center justify-center">
          <div className="-rotate-90 whitespace-nowrap text-xs font-bold uppercase tracking-[0.18em] text-[#646464] dark:text-[#b7b7b7]">
            {title}
          </div>
        </div>
        <div className={cn("-rotate-90 whitespace-nowrap text-[11px] font-bold", summaryClassName)}>
          {formatMoney(stats.totalProfitLoss, currency)}
        </div>
      </aside>
    </>
  );
}

function CollapsedFooterMonitor({
  currency,
  onToggleCollapse,
  stats,
  status,
  title,
}: {
  currency: string;
  onToggleCollapse?: () => void;
  stats: BotMonitorStats;
  status: BotMonitorStatus;
  title: string;
}) {
  const summaryClassName = summaryProfitLossClassName(stats.totalProfitLoss);
  return (
    <button
      aria-label="Expand bot monitor"
      className="fixed inset-x-2 bottom-2 z-40 mx-auto flex h-11 max-w-6xl items-center gap-3 rounded-lg border border-[#d8d8d8] bg-white px-3 text-left text-[#333333] shadow-lg transition hover:bg-[#f7f7f7] dark:border-[#2c2c2c] dark:bg-[#151515] dark:text-[#eeeeee] dark:hover:bg-[#202020]"
      type="button"
      onClick={onToggleCollapse}
    >
      <StatusDot status={status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold uppercase tracking-wide">{title}</div>
        <div className={cn("truncate font-mono text-[11px]", summaryClassName)}>
          Runs {stats.runs} / P/L {formatMoney(stats.totalProfitLoss, currency)}
        </div>
      </div>
      <ChevronUp className="size-4 shrink-0" />
    </button>
  );
}

function StatusDot({ status }: { status: BotMonitorStatus }) {
  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        status === "running" && "bg-[#4bb4b3] shadow-[0_0_0_3px_rgba(75,180,179,0.18)]",
        status === "stopped" && "bg-[#999999]",
        status === "error" && "bg-[#ff444f] shadow-[0_0_0_3px_rgba(255,68,79,0.18)]",
      )}
    />
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName,
}: {
  label: number | string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-[#333] dark:text-[#eeeeee]">{label}</div>
      <div
        className={cn("mt-3 break-words text-xs text-[#333] dark:text-[#eeeeee]", valueClassName)}
      >
        {value}
      </div>
    </div>
  );
}

function profitLossClassName(value: number, status?: BotMonitorTransaction["status"]) {
  if (status === "open") return "text-[#555] dark:text-[#d8d8d8]";
  return value >= 0
    ? "font-bold text-[#078a5b] dark:text-[#42d48c]"
    : "font-bold text-[#cc2f39] dark:text-[#ff6b73]";
}

function summaryProfitLossClassName(value: number) {
  return value >= 0
    ? "font-bold text-[#078a5b] dark:text-[#42d48c]"
    : "font-bold text-[#cc2f39] dark:text-[#ff6b73]";
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center bg-[#f1f2f3] text-sm text-[#555] dark:bg-[#202020] dark:text-[#d8d8d8]">
      {title}
    </div>
  );
}

function SpotStack({ transaction }: { transaction: BotMonitorTransaction }) {
  const showClosedSpots = transaction.status !== "open";
  return (
    <div className="space-y-1.5">
      <SpotValue tone="entry" value={showClosedSpots ? transaction.entrySpot ?? null : null} />
      <SpotValue tone="exit" value={showClosedSpots ? transaction.exitSpot ?? null : null} />
    </div>
  );
}

function SpotValue({
  tone,
  value,
}: {
  tone: "entry" | "exit";
  value: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-[#333] dark:text-[#eeeeee]">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full border bg-transparent",
          tone === "entry" ? "border-[#ff444f]" : "border-[#b7bcc2] dark:border-[#737980]",
        )}
      />
      <span className="font-mono tabular-nums">{formatSpot(value)}</span>
      <span className="sr-only">{tone === "entry" ? "Entry spot" : "Exit spot"}</span>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(2)} ${currency}`;
}

function formatSignedMoney(value: number, currency: string) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)} ${currency}`;
}

function formatSpot(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
    minimumFractionDigits: 2,
  });
}
