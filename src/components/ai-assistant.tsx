import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SYNTHETIC_MARKETS, type TradeCategory } from "@/lib/deriv";
import {
  AlertTriangle,
  Bot,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import {
  persistAssistantButtonPosition,
  readActivityMemory,
  readAssistantButtonPosition,
  readBotMonitorSnapshot,
  readRememberedMarket,
  readTrackedTrades,
  recordActivity,
  rememberMarketSelection,
} from "@/lib/activity-memory";
import { readSavedBotPresets } from "@/lib/bot-builder-state";
import {
  analyzeBestBotOpportunities,
  analyzeBestMarketForContract,
  recommendManualStake,
  recommendStakeAndMartingale,
  type AnalysisProgress,
  type BotOpportunity,
  type ManualContractKind,
  type ManualMarketSuggestion,
  type ManualStakeRecommendation,
  type StakeRecommendation,
} from "@/lib/market-analysis";
import { deployBotFromAiSuggestion } from "@/lib/bot-builder-memory";
import { setManualTradePickup } from "@/lib/manual-trade-pickup";
import { useBotRunner } from "@/context/bot-runner-context";
import { cn } from "@/lib/utils";

// The 10 synthetic digit markets the AI scans / can trade.
const MANUAL_MARKET_SYMBOLS = [
  "R_10", "1HZ10V", "R_25", "1HZ25V", "R_50",
  "1HZ50V", "R_75", "1HZ75V", "R_100", "1HZ100V",
] as const;

function marketLabel(symbol: string): string {
  return SYNTHETIC_MARKETS.find((m) => m.symbol === symbol)?.name ?? symbol;
}

/** Maps an AI suggestion side label (e.g. "Over 4", "Differs 3", "Rise") to a
 *  purchase direction + prediction digit understood by the trade engine. */
function parseSuggestionSide(
  kind: ManualContractKind,
  sideLabel: string,
): { selectedDigit: number; side: string } {
  const lower = sideLabel.toLowerCase();
  const digitMatch = sideLabel.match(/(\d)/);
  const digit = digitMatch ? Number(digitMatch[1]) : 5;
  if (kind === "even_odd") return { selectedDigit: 5, side: lower.startsWith("odd") ? "odd" : "even" };
  if (kind === "over_under")
    return { selectedDigit: digit, side: lower.startsWith("under") ? "under" : "over" };
  if (kind === "matches_differs")
    return { selectedDigit: digit, side: lower.startsWith("differs") ? "differs" : "matches" };
  if (kind === "accumulator") return { selectedDigit: 5, side: "buy" };
  return { selectedDigit: 5, side: lower.startsWith("fall") ? "down" : "up" };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type AssistantTab = "best-bot" | "manual" | "memory";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSISTANT_BUTTON_SIZE_DESKTOP = 56;
const ASSISTANT_BUTTON_SIZE_MOBILE = 40;

const MANUAL_KIND_LABELS: Record<ManualContractKind, string> = {
  even_odd: "Even / Odd",
  matches_differs: "Matches / Differs",
  over_under: "Over / Under",
  rise_fall: "Rise / Fall",
  accumulator: "Accumulators",
};

const MANUAL_KIND_DESC: Record<ManualContractKind, string> = {
  even_odd: "Last digit is even or odd",
  matches_differs: "Last digit matches a specific digit",
  over_under: "Last digit over or under a threshold",
  rise_fall: "Predict tick direction",
  accumulator: "Grow a stake while price stays in range",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function AiAssistant({
  currentPath,
  showBotMonitor,
}: {
  currentPath: string;
  showBotMonitor: boolean;
}) {
  const { user } = useAuth();
  const { balance: rawBalance, currency } = useDerivBalanceContext();
  const { startBot, status: botRunnerStatus } = useBotRunner();
  const navigate = useNavigate();
  const balance = rawBalance ?? 0;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AssistantTab>("best-bot");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(() => readViewport());

  // Best Bot state
  const [botOpportunities, setBotOpportunities] = useState<BotOpportunity[]>([]);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [botHasRun, setBotHasRun] = useState(false);
  const [botProgress, setBotProgress] = useState<AnalysisProgress | null>(null);
  const [botLastAnalysisAt, setBotLastAnalysisAt] = useState<Date | null>(null);
  const [launchingPresetId, setLaunchingPresetId] = useState<string | null>(null);

  // Manual Trader state
  const [manualKind, setManualKind] = useState<ManualContractKind | null>(null);
  const [manualSuggestions, setManualSuggestions] = useState<ManualMarketSuggestion[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualHasRun, setManualHasRun] = useState(false);
  const [manualProgress, setManualProgress] = useState<AnalysisProgress | null>(null);
  const [manualLastAnalysisAt, setManualLastAnalysisAt] = useState<Date | null>(null);

  // Best Bot preset inputs (set by the user before analysis, deployed on launch).
  const [botStake, setBotStake] = useState(1);
  const [botTakeProfit, setBotTakeProfit] = useState(100);
  const [botStopLoss, setBotStopLoss] = useState(30);
  const [botMartingale, setBotMartingale] = useState(2);
  const [botRuns, setBotRuns] = useState(50);

  // Manual Trader preset inputs.
  const [manualSymbol, setManualSymbol] = useState<string>("auto");
  const [manualStake, setManualStake] = useState(1);
  const [manualTakeProfit, setManualTakeProfit] = useState(100);
  const [manualStopLoss, setManualStopLoss] = useState(30);
  const [manualGrowthRate, setManualGrowthRate] = useState(3);

  const dragRef = useRef<{
    moved: boolean;
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const buttonSize = viewport.width < 640 ? ASSISTANT_BUTTON_SIZE_MOBILE : ASSISTANT_BUTTON_SIZE_DESKTOP;
  const activeScope = scopeFromPath(currentPath);
  const currentMarket =
    readRememberedMarket(user?.id, activeScope, readRememberedMarket(user?.id, "manual", "1HZ100V") ?? "1HZ100V") ??
    "1HZ100V";

  // Memory view
  const memorySnapshot = useMemo(() => readActivityMemory(user?.id), [open, user?.id]);
  const trades = useMemo(() => readTrackedTrades(user?.id).slice(0, 6), [open, user?.id]);
  const savedPresets = useMemo(() => readSavedBotPresets(user?.id), [open, user?.id]);
  const botMonitorSnapshot = useMemo(() => readBotMonitorSnapshot(user?.id), [open, user?.id]);

  // Stake recommendations (memoized on balance + top pick)
  const topBot = botOpportunities[0] ?? null;
  const stakeRecommendation = useMemo<StakeRecommendation | null>(() => {
    if (!topBot || balance <= 0) return null;
    return recommendStakeAndMartingale({
      balance,
      presetMartingale: topBot.presetMartingale,
      presetMartingaleMode: topBot.presetMartingaleMode,
      presetStake: topBot.presetStake,
    });
  }, [balance, topBot]);

  const topManual = manualSuggestions[0] ?? null;
  const manualStakeAdvice = useMemo<ManualStakeRecommendation | null>(() => {
    if (!topManual || balance <= 0) return null;
    return recommendManualStake({ balance, edge: topManual.edge });
  }, [balance, topManual]);

  // ── Viewport / position effects ──────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setViewport(readViewport());
    sync();
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readAssistantButtonPosition(user?.id) ?? defaultButtonPosition(viewport, showBotMonitor);
    setPosition(clampPosition(stored, viewport, buttonSize));
  }, [buttonSize, showBotMonitor, user?.id, viewport]);

  // ── Manual analysis run (explicit, user-triggered) ───────────────────────────

  async function runBotAnalysis() {
    if (botLoading) return;
    setBotLoading(true);
    setBotError(null);
    setBotHasRun(true);
    setBotProgress({ pct: 0, stage: "Starting AI analysis…" });
    try {
      const result = await analyzeBestBotOpportunities({
        forceRefresh: true,
        onProgress: (p) => setBotProgress(p),
      });
      setBotOpportunities(result);
      setBotLastAnalysisAt(new Date());
      recordActivity(user?.id, {
        message: `AI bot scan: ${result.length} presets ranked.`,
        meta: { view: "best-bot" },
        type: "assistant",
      });
    } catch (err) {
      setBotError(err instanceof Error ? err.message : "Analysis could not be completed.");
    } finally {
      setBotLoading(false);
      setBotProgress(null);
    }
  }

  async function runManualAnalysis() {
    if (manualLoading || !manualKind) return;
    setManualLoading(true);
    setManualError(null);
    setManualHasRun(true);
    setManualProgress({ pct: 0, stage: "Starting AI analysis…" });
    try {
      const result = await analyzeBestMarketForContract(manualKind, {
        forceRefresh: true,
        onProgress: (p) => setManualProgress(p),
      });
      setManualSuggestions(result);
      setManualLastAnalysisAt(new Date());
      recordActivity(user?.id, {
        message: `AI manual scan: ${manualKind.replace("_", "/")} across ${result.length} markets.`,
        meta: { kind: manualKind, view: "manual" },
        type: "assistant",
      });
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Analysis could not be completed.");
    } finally {
      setManualLoading(false);
      setManualProgress(null);
    }
  }

  // ── Panel dimensions ──────────────────────────────────────────────────────────

  const panelStyle = useMemo(() => {
    const panelWidth = Math.min(viewport.width - 16, viewport.width < 640 ? 340 : 390);
    const panelHeight = Math.min(viewport.height - 88, viewport.width < 640 ? 540 : 580);
    const anchor = position ?? defaultButtonPosition(viewport, showBotMonitor);
    return {
      height: panelHeight,
      left: clampNumber(anchor.x + buttonSize - panelWidth, 8, viewport.width - panelWidth - 8),
      top: clampNumber(anchor.y - panelHeight - 12, 64, viewport.height - panelHeight - 8),
      width: panelWidth,
    };
  }, [buttonSize, position, showBotMonitor, viewport]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function toggleOpen() {
    setOpen((v) => !v);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = {
      moved: false,
      originX: position?.x ?? defaultButtonPosition(viewport, showBotMonitor).x,
      originY: position?.y ?? defaultButtonPosition(viewport, showBotMonitor).y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }, viewport, buttonSize));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (position) persistAssistantButtonPosition(user?.id, position);
    if (!drag.moved) toggleOpen();
  }

  async function handleLaunchBestBot(bot: BotOpportunity) {
    if (!user?.id) {
      toast.error("Sign in to deploy a bot.");
      return;
    }
    if (!(botStake > 0)) {
      toast.error("Enter a stake before launching.");
      return;
    }
    setLaunchingPresetId(bot.presetId);
    try {
      await deployBotFromAiSuggestion({
        userId: user.id,
        presetId: bot.presetId,
        stake: botStake,
        martingale: botMartingale,
        takeProfit: botTakeProfit,
        stopLoss: botStopLoss,
        maxRuns: botRuns,
      });
      toast.success(`${bot.name} deployed. Auto-running with your presets…`);
      setOpen(false);
      await navigate({ to: "/bot-builder" });
      // Kick off the bot run loop immediately with the deployed presets.
      if (botRunnerStatus !== "running") void startBot();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy bot.");
    } finally {
      setLaunchingPresetId(null);
    }
  }

  function applyBotSuggestion() {
    if (!stakeRecommendation) return;
    setBotStake(Number(stakeRecommendation.stake.toFixed(2)));
    setBotMartingale(Number(stakeRecommendation.martingale.toFixed(2)));
  }

  function handleLaunchManualTrader() {
    if (!manualKind) return;
    // Use the AI's top market unless the user pinned a specific pair.
    let target = topManual;
    if (manualSymbol !== "auto") {
      target = manualSuggestions.find((s) => s.symbol === manualSymbol) ?? topManual;
    }
    if (!target) {
      toast.error("Run the analysis first to identify a market.");
      return;
    }
    if (!(manualStake > 0)) {
      toast.error("Enter a stake before launching.");
      return;
    }
    const { side, selectedDigit } = parseSuggestionSide(manualKind, target.side);
    setManualTradePickup({
      symbol: target.symbol,
      tradeType: manualKind as TradeCategory,
      stake: manualStake,
      takeProfit: manualTakeProfit,
      stopLoss: manualStopLoss,
      growthRate: manualGrowthRate,
      side,
      selectedDigit,
      autoRun: true,
    });
    rememberMarketSelection(user?.id, "manual", target.symbol);
    toast.success(`Launching auto-trade on ${target.marketLabel}.`);
    setOpen(false);
    void navigate({ to: "/" });
  }

  function handleManualKindChange(kind: ManualContractKind | null) {
    setManualKind(kind);
    setManualSuggestions([]);
    setManualError(null);
    setManualLastAnalysisAt(null);
    setManualHasRun(false);
    setManualProgress(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const lastAnalysisAt = tab === "best-bot" ? botLastAnalysisAt : manualLastAnalysisAt;

  return (
    <>
      {open && (
        <aside
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[#d7dce0] bg-white shadow-2xl dark:border-[#2a2f35] dark:bg-[#101214]"
          style={panelStyle}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#e7eaee] px-4 py-3 dark:border-[#24282d]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Bot className="size-4 text-[#4bb4b3]" />
                <span className="truncate">AI Market Assistant</span>
              </div>
              <div className="truncate text-[11px] text-[#6b7280] dark:text-[#aab1b8]">
                {lastAnalysisAt
                  ? `Updated ${lastAnalysisAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${currentMarket}`
                  : `Current market: ${currentMarket}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (tab === "best-bot") void runBotAnalysis();
                  else if (tab === "manual" && manualKind) void runManualAnalysis();
                }}
                disabled={
                  tab === "memory" ||
                  (tab === "manual" && !manualKind) ||
                  botLoading ||
                  manualLoading
                }
                className="flex size-8 items-center justify-center rounded-full border border-[#d7dce0] text-[#51606c] transition hover:bg-[#f5f7f8] disabled:opacity-40 dark:border-[#2a2f35] dark:text-[#c9d0d7] dark:hover:bg-[#171a1d]"
                aria-label="Rerun analysis"
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    (botLoading || manualLoading) && tab !== "memory" && "animate-spin",
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full border border-[#d7dce0] text-[#51606c] transition hover:bg-[#f5f7f8] dark:border-[#2a2f35] dark:text-[#c9d0d7] dark:hover:bg-[#171a1d]"
                aria-label="Close AI assistant"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-[#e7eaee] px-3 py-2 dark:border-[#24282d]">
            {(["best-bot", "manual", "memory"] as AssistantTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  tab === t
                    ? "bg-[#4bb4b3] text-white"
                    : "bg-[#eef2f4] text-[#42505b] hover:bg-[#e4eaee] dark:bg-[#171a1d] dark:text-[#d4dbe2] dark:hover:bg-[#1f2428]",
                )}
              >
                {t === "best-bot" ? "Best Bot" : t === "manual" ? "Manual Trader" : "Memory"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
            {tab === "best-bot" && (
              <BestBotView
                hasRun={botHasRun}
                loading={botLoading}
                error={botError}
                opportunities={botOpportunities}
                stakeRecommendation={stakeRecommendation}
                balance={balance}
                currency={currency ?? "USD"}
                launchingPresetId={launchingPresetId}
                onLaunch={handleLaunchBestBot}
                presetStake={botStake}
                onPresetStake={setBotStake}
                presetTakeProfit={botTakeProfit}
                onPresetTakeProfit={setBotTakeProfit}
                presetStopLoss={botStopLoss}
                onPresetStopLoss={setBotStopLoss}
                presetMartingale={botMartingale}
                onPresetMartingale={setBotMartingale}
                presetRuns={botRuns}
                onPresetRuns={setBotRuns}
                onApplySuggestion={applyBotSuggestion}
              />
            )}

            {tab === "manual" && (
              <ManualTraderView
                hasRun={manualHasRun}
                loading={manualLoading}
                error={manualError}
                kind={manualKind}
                suggestions={manualSuggestions}
                stakeAdvice={manualStakeAdvice}
                currency={currency ?? "USD"}
                onKindChange={handleManualKindChange}
                onLaunch={handleLaunchManualTrader}
                symbol={manualSymbol}
                onSymbolChange={setManualSymbol}
                presetStake={manualStake}
                onPresetStake={setManualStake}
                presetTakeProfit={manualTakeProfit}
                onPresetTakeProfit={setManualTakeProfit}
                presetStopLoss={manualStopLoss}
                onPresetStopLoss={setManualStopLoss}
                presetGrowthRate={manualGrowthRate}
                onPresetGrowthRate={setManualGrowthRate}
              />
            )}

            {tab === "memory" && (
              <MemoryView
                currentMarket={currentMarket}
                savedPresetsCount={savedPresets.length}
                trades={trades}
                botMonitorSnapshot={botMonitorSnapshot}
                activities={memorySnapshot.activities}
              />
            )}
          </div>

          {/* Sticky footer: AI Market Scan action */}
          {tab !== "memory" && (
            <div className="shrink-0 border-t border-[#e7eaee] bg-white p-3 dark:border-[#24282d] dark:bg-[#101214]">
              <button
                type="button"
                onClick={() => {
                  if (tab === "best-bot") void runBotAnalysis();
                  else if (tab === "manual" && manualKind) void runManualAnalysis();
                }}
                disabled={
                  botLoading ||
                  manualLoading ||
                  (tab === "manual" && !manualKind)
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4bb4b3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3aa09e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {botLoading || manualLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing markets…
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    {tab === "manual" && !manualKind
                      ? "Choose a contract first"
                      : "Run AI Market Scan"}
                  </>
                )}
              </button>
            </div>
          )}
        </aside>
      )}

      {position && (
        <button
          aria-label="AI assistant"
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ left: position.x, top: position.y, touchAction: "none" }}
          className="fixed z-50 flex items-center justify-center rounded-full bg-gradient-to-br from-[#0f766e] to-[#0f172a] text-white shadow-lg transition-transform hover:scale-105"
        >
          <div
            className={cn(
              "relative flex items-center justify-center rounded-full",
              buttonSize === ASSISTANT_BUTTON_SIZE_MOBILE ? "size-10" : "size-14",
            )}
          >
            <Sparkles className={buttonSize === ASSISTANT_BUTTON_SIZE_MOBILE ? "size-4" : "size-5"} />
            <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[#4bb4b3]" />
            <span
              className={cn(
                "absolute -bottom-1 font-bold",
                buttonSize === ASSISTANT_BUTTON_SIZE_MOBILE ? "text-[8px]" : "text-[10px]",
              )}
            >
              AI
            </span>
          </div>
        </button>
      )}
    </>
  );
}

// ─── Best Bot view ────────────────────────────────────────────────────────────

function BestBotView({
  hasRun,
  loading,
  error,
  opportunities,
  stakeRecommendation,
  balance,
  currency,
  launchingPresetId,
  onLaunch,
  presetStake,
  onPresetStake,
  presetTakeProfit,
  onPresetTakeProfit,
  presetStopLoss,
  onPresetStopLoss,
  presetMartingale,
  onPresetMartingale,
  presetRuns,
  onPresetRuns,
  onApplySuggestion,
}: {
  hasRun: boolean;
  loading: boolean;
  error: string | null;
  opportunities: BotOpportunity[];
  stakeRecommendation: StakeRecommendation | null;
  balance: number;
  currency: string;
  launchingPresetId: string | null;
  onLaunch: (bot: BotOpportunity) => void;
  presetStake: number;
  onPresetStake: (n: number) => void;
  presetTakeProfit: number;
  onPresetTakeProfit: (n: number) => void;
  presetStopLoss: number;
  onPresetStopLoss: (n: number) => void;
  presetMartingale: number;
  onPresetMartingale: (n: number) => void;
  presetRuns: number;
  onPresetRuns: (n: number) => void;
  onApplySuggestion: () => void;
}) {
  const topBot = opportunities[0] ?? null;
  const rest = opportunities.slice(1, 5);

  const header = (
    <>
      <StepCard
        title="Step 1 · Set your bot parameters"
        description="Enter your stake, risk limits, martingale and number of runs. The AI scans for the best market + bot, applies these to the bot builder, and auto-runs it on launch."
      />
      <BotPresetForm
        currency={currency}
        stake={presetStake}
        onStake={onPresetStake}
        martingale={presetMartingale}
        onMartingale={onPresetMartingale}
        takeProfit={presetTakeProfit}
        onTakeProfit={onPresetTakeProfit}
        stopLoss={presetStopLoss}
        onStopLoss={onPresetStopLoss}
        runs={presetRuns}
        onRuns={onPresetRuns}
      />
      {stakeRecommendation && (
        <ApplySuggestionButton
          label={`Apply AI suggestion · ${currency} ${stakeRecommendation.stake.toFixed(2)} · ×${stakeRecommendation.martingale.toFixed(2)}`}
          onClick={onApplySuggestion}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {header}
        <RunningCard description="Pulling the latest 500 ticks across every synthetic market for the recommendation." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        {header}
        <ErrorCard message={error} />
        <AccuracyDisclaimer />
      </div>
    );
  }

  if (!hasRun || !topBot) {
    return (
      <div className="space-y-3">
        {header}
        <AccuracyDisclaimer />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      {/* Top pick */}
      <div className="rounded-xl border border-[#c6eeec] bg-[#eef9f8] p-3 dark:border-[#1f403f] dark:bg-[#102726]">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#4bb4b3]">
          Top pick
        </div>
        <div className="font-semibold text-[#172029] dark:text-[#f1f5f9]">{topBot.name}</div>
        <div className="mt-0.5 text-xs text-[#62707c] dark:text-[#aab1b8]">
          {topBot.marketLabel} · {topBot.tradeType.replace("_", "/")} / {topBot.contractType}
          {!topBot.launchable && (
            <span className="ml-2 rounded bg-[#fef3c7] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#92400e] dark:bg-[#3b2a10] dark:text-[#fcd34d]">
              Not deployable
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <RecommendationStat label="Actual" value={`${topBot.actualProbability.toFixed(1)}%`} />
          <RecommendationStat label="Expected" value={`${topBot.expectedProbability.toFixed(1)}%`} />
          <RecommendationStat
            label="Edge"
            value={signedPercent(topBot.edge)}
            valueClassName={topBot.edge >= 0 ? "text-[#078a5b]" : "text-[#cc2f39]"}
          />
        </div>
      </div>

      {/* Stake / martingale recommender */}
      {stakeRecommendation && (
        <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
            Risk-sized entry
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RecommendationStat label="Stake" value={`${currency} ${stakeRecommendation.stake.toFixed(2)}`} />
            <RecommendationStat label="Martingale" value={`×${stakeRecommendation.martingale.toFixed(2)}`} />
            <RecommendationStat
              label="Risk band"
              value={capitalize(stakeRecommendation.riskBand)}
              valueClassName={
                stakeRecommendation.riskBand === "conservative"
                  ? "text-[#2563eb]"
                  : stakeRecommendation.riskBand === "balanced"
                    ? "text-[#d97706]"
                    : "text-[#cc2f39]"
              }
            />
            <RecommendationStat
              label={`Worst loss (${stakeRecommendation.streakLength}-streak)`}
              value={`${currency} ${stakeRecommendation.maxLoss.toFixed(2)}`}
            />
          </div>
          <p className="mt-2 text-[11px] text-[#62707c] dark:text-[#aab1b8]">
            {stakeRecommendation.rationale}
          </p>
        </div>
      )}

      {balance <= 0 && (
        <InfoCard title="Balance unavailable">
          Connect a Deriv account to get stake recommendations based on your live balance.
        </InfoCard>
      )}

      {/* Launch button — deploys the user's presets and auto-runs the bot. */}
      {topBot.launchable && (
        <button
          type="button"
          onClick={() => onLaunch(topBot)}
          disabled={launchingPresetId === topBot.presetId}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4bb4b3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3aa09e] disabled:opacity-60"
        >
          {launchingPresetId === topBot.presetId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Rocket className="size-4" />
          )}
          Launch &amp; auto-run on {topBot.marketLabel}
        </button>
      )}

      {/* Ranked list */}
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((item) => (
            <div
              key={item.presetId}
              className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-[#172029] dark:text-[#f1f5f9]">{item.name}</div>
                {!item.launchable && (
                  <span className="shrink-0 rounded bg-[#fef3c7] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#92400e] dark:bg-[#3b2a10] dark:text-[#fcd34d]">
                    Not deployable
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-[#62707c] dark:text-[#aab1b8]">
                {item.marketLabel} · {item.tradeType.replace("_", "/")} / {item.contractType}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span>Actual {item.actualProbability.toFixed(1)}%</span>
                <span>Expected {item.expectedProbability.toFixed(1)}%</span>
                <span className={item.edge >= 0 ? "text-[#078a5b]" : "text-[#cc2f39]"}>
                  Edge {signedPercent(item.edge)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <AccuracyDisclaimer />
    </div>
  );
}

// ─── Manual Trader view ───────────────────────────────────────────────────────

function ManualTraderView({
  hasRun,
  loading,
  error,
  kind,
  suggestions,
  stakeAdvice,
  currency,
  onKindChange,
  onLaunch,
  symbol,
  onSymbolChange,
  presetStake,
  onPresetStake,
  presetTakeProfit,
  onPresetTakeProfit,
  presetStopLoss,
  onPresetStopLoss,
  presetGrowthRate,
  onPresetGrowthRate,
}: {
  hasRun: boolean;
  loading: boolean;
  error: string | null;
  kind: ManualContractKind | null;
  suggestions: ManualMarketSuggestion[];
  stakeAdvice: ManualStakeRecommendation | null;
  currency: string;
  onKindChange: (kind: ManualContractKind | null) => void;
  onLaunch: () => void;
  symbol: string;
  onSymbolChange: (v: string) => void;
  presetStake: number;
  onPresetStake: (n: number) => void;
  presetTakeProfit: number;
  onPresetTakeProfit: (n: number) => void;
  presetStopLoss: number;
  onPresetStopLoss: (n: number) => void;
  presetGrowthRate: number;
  onPresetGrowthRate: (n: number) => void;
}) {
  const topMarket = suggestions[0] ?? null;
  const rest = suggestions.slice(1, 7);

  if (!kind) {
    return (
      <div className="space-y-3">
        <StepCard
          title="Step 1 · Choose your contract"
          description="Pick the contract type you want the AI to trade. It scans every synthetic market, picks the strongest setup, applies your presets to the trade panel, and auto-places the trade on launch."
        />
        <div className="grid grid-cols-2 gap-2">
          {(
            ["even_odd", "over_under", "matches_differs", "rise_fall", "accumulator"] as ManualContractKind[]
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKindChange(k)}
              className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 text-left transition hover:border-[#4bb4b3] hover:bg-[#eef9f8] dark:border-[#24282d] dark:bg-[#141719] dark:hover:border-[#4bb4b3] dark:hover:bg-[#102726]"
            >
              <div className="text-xs font-semibold text-[#172029] dark:text-[#f1f5f9]">
                {MANUAL_KIND_LABELS[k]}
              </div>
              <div className="mt-0.5 text-[10px] text-[#62707c] dark:text-[#aab1b8]">
                {MANUAL_KIND_DESC[k]}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Back / kind label */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onKindChange(null)}
          className="rounded-full border border-[#d7dce0] px-2.5 py-1 text-[11px] font-semibold text-[#51606c] transition hover:bg-[#f0f3f5] dark:border-[#2a2f35] dark:text-[#c9d0d7] dark:hover:bg-[#171a1d]"
        >
          ← Back
        </button>
        <span className="text-xs font-semibold text-[#172029] dark:text-[#f1f5f9]">
          {MANUAL_KIND_LABELS[kind]}
        </span>
      </div>

      <StepCard
        title="Step 2 · Set your trade presets"
        description="These values are transferred to the manual trader inputs and the trade is placed automatically when you launch."
      />
      <MarketPairSelect value={symbol} onChange={onSymbolChange} />
      <ManualPresetForm
        currency={currency}
        stake={presetStake}
        onStake={onPresetStake}
        takeProfit={presetTakeProfit}
        onTakeProfit={onPresetTakeProfit}
        stopLoss={presetStopLoss}
        onStopLoss={onPresetStopLoss}
        showGrowthRate={kind === "accumulator"}
        growthRate={presetGrowthRate}
        onGrowthRate={onPresetGrowthRate}
      />

      {loading && (
        <RunningCard description={`Pulling the latest 500 ticks across every synthetic market for the best ${MANUAL_KIND_LABELS[kind]} signal.`} />
      )}

      {!loading && hasRun && error && <ErrorCard message={error} />}

      {!loading && hasRun && !error && topMarket && (
        <>
          {/* Top market */}
          <div className="rounded-xl border border-[#c6eeec] bg-[#eef9f8] p-3 dark:border-[#1f403f] dark:bg-[#102726]">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#4bb4b3]">
              Best market
            </div>
            <div className="font-semibold text-[#172029] dark:text-[#f1f5f9]">{topMarket.marketLabel}</div>
            <div className="mt-0.5 text-xs font-medium text-[#42505b] dark:text-[#d4dbe2]">
              {topMarket.side}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <RecommendationStat label="Hit rate" value={`${topMarket.hitRate.toFixed(1)}%`} />
              <RecommendationStat label="Expected" value={`${topMarket.expectation.toFixed(1)}%`} />
              <RecommendationStat
                label="Edge"
                value={signedPercent(topMarket.edge)}
                valueClassName={topMarket.edge >= 0 ? "text-[#078a5b]" : "text-[#cc2f39]"}
              />
            </div>
          </div>

          {/* Digit heatmap */}
          {kind !== "rise_fall" && topMarket.digitPercentages && (
            <DigitHeatmap percentages={topMarket.digitPercentages} />
          )}

          {/* Flat-stake advice */}
          {stakeAdvice && (
            <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
                Flat stake advice
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <RecommendationStat label="Stake" value={`${currency} ${stakeAdvice.stake.toFixed(2)}`} />
                <RecommendationStat
                  label="Risk band"
                  value={capitalize(stakeAdvice.riskBand)}
                  valueClassName={
                    stakeAdvice.riskBand === "conservative"
                      ? "text-[#2563eb]"
                      : stakeAdvice.riskBand === "balanced"
                        ? "text-[#d97706]"
                        : "text-[#cc2f39]"
                  }
                />
              </div>
              <p className="mt-2 text-[11px] text-[#62707c] dark:text-[#aab1b8]">
                {stakeAdvice.rationale}
              </p>
            </div>
          )}

          {/* Launch */}
          <button
            type="button"
            onClick={onLaunch}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4bb4b3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3aa09e]"
          >
            <Rocket className="size-4" />
            Launch &amp; auto-trade
          </button>

          {/* Ranked list */}
          {rest.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
                Other markets
              </div>
              {rest.map((s) => (
                <div
                  key={s.symbol}
                  className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-[#172029] dark:text-[#f1f5f9]">
                      {s.marketLabel}
                    </div>
                    <div className="shrink-0 text-xs font-medium text-[#42505b] dark:text-[#d4dbe2]">
                      {s.side}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                    <span>Hit {s.hitRate.toFixed(1)}%</span>
                    <span>Exp {s.expectation.toFixed(1)}%</span>
                    <span className={s.edge >= 0 ? "text-[#078a5b]" : "text-[#cc2f39]"}>
                      {signedPercent(s.edge)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && hasRun && !error && !topMarket && kind && (
        <InfoCard title="No results">
          Run the scan again to refresh the markets.
        </InfoCard>
      )}

      <AccuracyDisclaimer />
    </div>
  );
}

// ─── Memory view (unchanged from original) ────────────────────────────────────

function MemoryView({
  currentMarket,
  savedPresetsCount,
  trades,
  botMonitorSnapshot,
  activities,
}: {
  currentMarket: string;
  savedPresetsCount: number;
  trades: ReturnType<typeof readTrackedTrades>;
  botMonitorSnapshot: ReturnType<typeof readBotMonitorSnapshot>;
  activities: ReturnType<typeof readActivityMemory>["activities"];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <MemoryCard label="Current market" value={currentMarket} />
        <MemoryCard label="Saved bot presets" value={savedPresetsCount} />
        <MemoryCard label="Tracked trades" value={trades.length} />
        <MemoryCard
          label="Bot monitor P/L"
          value={botMonitorSnapshot ? `${botMonitorSnapshot.stats.totalProfitLoss.toFixed(2)}` : "0.00"}
          valueClassName={(botMonitorSnapshot?.stats.totalProfitLoss ?? 0) >= 0 ? "text-[#078a5b]" : "text-[#cc2f39]"}
        />
      </div>

      <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
          Recent trade memory
        </div>
        <div className="mt-2 space-y-2">
          {trades.length === 0 && (
            <div className="text-xs text-[#62707c] dark:text-[#aab1b8]">No tracked trades yet.</div>
          )}
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="rounded-lg border border-[#e7eaee] bg-white px-3 py-2 text-xs dark:border-[#24282d] dark:bg-[#101214]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{trade.market}</span>
                <span
                  className={cn(
                    trade.status === "open" && "text-[#64707c] dark:text-[#aab1b8]",
                    trade.status === "won" && "text-[#078a5b]",
                    (trade.status === "lost" || trade.status === "sold") && "text-[#cc2f39]",
                  )}
                >
                  {trade.status}
                </span>
              </div>
              <div className="mt-1 text-[#62707c] dark:text-[#aab1b8]">
                {trade.source} · {trade.contractType} · {trade.stake.toFixed(2)} {trade.currency}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
          Recent activity
        </div>
        <div className="mt-2 space-y-2">
          {activities.length === 0 && (
            <div className="text-xs text-[#62707c] dark:text-[#aab1b8]">No saved activity yet.</div>
          )}
          {activities.slice(0, 6).map((activity) => (
            <div
              key={activity.id}
              className="rounded-lg border border-[#e7eaee] bg-white px-3 py-2 text-xs dark:border-[#24282d] dark:bg-[#101214]"
            >
              <div className="font-medium">{activity.message}</div>
              <div className="mt-1 text-[#62707c] dark:text-[#aab1b8]">
                {new Date(activity.time).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UnitInput({
  label,
  value,
  onChange,
  unit,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8a939c] dark:text-[#8b949c]">
        {label}
      </span>
      <div className="mt-1 flex items-center rounded-lg border border-[#dfe4e8] bg-white px-3 focus-within:border-[#4bb4b3] dark:border-[#2a2f35] dark:bg-[#0c0e10]">
        <input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 w-full min-w-0 bg-transparent text-sm font-semibold text-[#172029] outline-none dark:text-[#f1f5f9]"
        />
        {unit && (
          <span className="ml-2 shrink-0 text-[11px] font-medium text-[#9aa3ab]">{unit}</span>
        )}
      </div>
    </label>
  );
}

function StepCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-[#c6eeec] bg-[#eef9f8] p-4 dark:border-[#1f403f] dark:bg-[#102726]">
      <div className="text-sm font-bold text-[#172029] dark:text-[#f1f5f9]">{title}</div>
      <p className="mt-1 text-[13px] leading-5 text-[#3f6f6d] dark:text-[#9fc7c5]">{description}</p>
    </div>
  );
}

function RunningCard({ description }: { description: string }) {
  return (
    <div className="rounded-2xl border border-[#c6eeec] bg-[#eef9f8] p-4 dark:border-[#1f403f] dark:bg-[#102726]">
      <div className="text-sm font-bold text-[#172029] dark:text-[#f1f5f9]">Running analysis</div>
      <p className="mt-1 text-[13px] leading-5 text-[#3f6f6d] dark:text-[#9fc7c5]">{description}</p>
    </div>
  );
}

function BotPresetForm({
  currency,
  stake,
  onStake,
  martingale,
  onMartingale,
  takeProfit,
  onTakeProfit,
  stopLoss,
  onStopLoss,
  runs,
  onRuns,
}: {
  currency: string;
  stake: number;
  onStake: (n: number) => void;
  martingale: number;
  onMartingale: (n: number) => void;
  takeProfit: number;
  onTakeProfit: (n: number) => void;
  stopLoss: number;
  onStopLoss: (n: number) => void;
  runs: number;
  onRuns: (n: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-3 dark:bg-[#141719]">
      <div className="grid grid-cols-2 gap-3">
        <UnitInput label="Stake" value={stake} onChange={onStake} unit={currency} min={0.35} step={0.01} />
        <UnitInput label="Martingale" value={martingale} onChange={onMartingale} unit="×" min={1} step={0.05} />
        <UnitInput label="Take profit" value={takeProfit} onChange={onTakeProfit} unit={currency} min={0} step={0.01} />
        <UnitInput label="Stop loss" value={stopLoss} onChange={onStopLoss} unit={currency} min={0} step={0.01} />
      </div>
      <div className="mt-3">
        <UnitInput label="Number of runs" value={runs} onChange={onRuns} min={1} step={1} />
      </div>
    </div>
  );
}

function ManualPresetForm({
  currency,
  stake,
  onStake,
  takeProfit,
  onTakeProfit,
  stopLoss,
  onStopLoss,
  showGrowthRate,
  growthRate,
  onGrowthRate,
}: {
  currency: string;
  stake: number;
  onStake: (n: number) => void;
  takeProfit: number;
  onTakeProfit: (n: number) => void;
  stopLoss: number;
  onStopLoss: (n: number) => void;
  showGrowthRate: boolean;
  growthRate: number;
  onGrowthRate: (n: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-3 dark:bg-[#141719]">
      <div className="grid grid-cols-2 gap-3">
        <UnitInput label="Stake" value={stake} onChange={onStake} unit={currency} min={0.35} step={0.01} />
        {showGrowthRate ? (
          <UnitInput
            label="Growth rate"
            value={growthRate}
            onChange={onGrowthRate}
            unit="%"
            min={1}
            step={1}
          />
        ) : (
          <div />
        )}
        <UnitInput label="Take profit" value={takeProfit} onChange={onTakeProfit} unit={currency} min={0} step={0.01} />
        <UnitInput label="Stop loss" value={stopLoss} onChange={onStopLoss} unit={currency} min={0} step={0.01} />
      </div>
    </div>
  );
}

function MarketPairSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
        Trading pair
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-[#d7dce0] bg-white px-2 text-sm text-[#172029] outline-none focus:border-[#4bb4b3] dark:border-[#2a2f35] dark:bg-[#101214] dark:text-[#f1f5f9]"
      >
        <option value="auto">Auto — let the AI pick the best market</option>
        {MANUAL_MARKET_SYMBOLS.map((s) => (
          <option key={s} value={s}>
            {marketLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ApplySuggestionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c6eeec] bg-[#eef9f8] px-4 py-2 text-xs font-semibold text-[#0f766e] transition hover:bg-[#e0f4f3] dark:border-[#1f403f] dark:bg-[#102726] dark:text-[#8be6e4] dark:hover:bg-[#143432]"
    >
      <Sparkles className="size-3.5" />
      {label}
    </button>
  );
}

function AccuracyDisclaimer() {
  return (
    <div className="flex gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e] dark:border-[#4a3310] dark:bg-[#221c0d] dark:text-[#fcd34d]">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Synthetic indices are RNG-driven and do not react to news or events. This analysis
        traces the last 500 ticks and ranks markets by statistical confidence (z-score), not just
        raw edge. Edge values of 0–3% with low confidence are typical noise — always trade within
        your risk tolerance.
      </span>
    </div>
  );
}

function DigitHeatmap({ percentages }: { percentages: number[] }) {
  const max = Math.max(...percentages);
  return (
    <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
        Digit distribution
      </div>
      <div className="flex flex-wrap gap-1.5">
        {percentages.map((pct, digit) => {
          const isHot = pct === max && max > 0;
          return (
            <span
              key={digit}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-semibold",
                isHot
                  ? "border-[#4bb4b3] bg-[#e6f8f7] text-[#087a78] dark:border-[#4bb4b3] dark:bg-[#103536] dark:text-[#8be6e4]"
                  : "border-[#d7dce0] bg-white text-[#41515d] dark:border-[#2a2f35] dark:bg-[#101214] dark:text-[#d4dbe2]",
              )}
            >
              {digit}: {pct.toFixed(1)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RecommendationStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-[#6b7280] dark:text-[#9ca3af]">{label}</div>
      <div className={cn("font-semibold text-[#172029] dark:text-[#f1f5f9]", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#d8e7e6] bg-[#eef9f8] p-3 text-sm text-[#245a58] dark:border-[#1f403f] dark:bg-[#102726] dark:text-[#9ee5e3]">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 leading-6">{children}</div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#ffd4d7] bg-[#fff4f5] p-3 text-sm text-[#a52a34] dark:border-[#4a2025] dark:bg-[#221316] dark:text-[#ff98a1]">
      <div className="font-semibold">Analysis failed</div>
      <div className="mt-1 leading-6">{message}</div>
    </div>
  );
}

function MemoryCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e7eaee] bg-[#f7f9fa] p-3 dark:border-[#24282d] dark:bg-[#141719]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64707c] dark:text-[#aab1b8]">
        {label}
      </div>
      <div className={cn("mt-2 text-sm font-bold text-[#172029] dark:text-[#f1f5f9]", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function scopeFromPath(pathname: string) {
  if (pathname.startsWith("/analysis")) return "analysis" as const;
  if (pathname.startsWith("/charts")) return "charts" as const;
  if (pathname.startsWith("/bot-builder")) return "bot-builder" as const;
  return "manual" as const;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readViewport() {
  if (typeof window === "undefined") return { height: 800, width: 1280 };
  return { height: window.innerHeight, width: window.innerWidth };
}

function defaultButtonPosition(
  viewport: { height: number; width: number },
  showBotMonitor: boolean,
) {
  const size = viewport.width < 640 ? ASSISTANT_BUTTON_SIZE_MOBILE : ASSISTANT_BUTTON_SIZE_DESKTOP;
  return {
    x: viewport.width - size - 16,
    y: viewport.height - size - (showBotMonitor ? 84 : 16),
  };
}

function clampPosition(
  position: { x: number; y: number },
  viewport: { height: number; width: number },
  buttonSize: number,
) {
  return {
    x: clampNumber(position.x, 8, viewport.width - buttonSize - 8),
    y: clampNumber(position.y, 64, viewport.height - buttonSize - 8),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
