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
import type { TradeCategory } from "@/lib/deriv";
import {
  AlertTriangle,
  BrainCircuit,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  X,
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
  type BotOpportunity,
  type ManualContractKind,
  type ManualMarketSuggestion,
  type ManualStakeRecommendation,
  type StakeRecommendation,
} from "@/lib/market-analysis";
import { deployBotFromAiSuggestion } from "@/lib/bot-builder-memory";
import { setManualTradePickup } from "@/lib/manual-trade-pickup";
import { cn } from "@/lib/utils";

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
};

const MANUAL_KIND_DESC: Record<ManualContractKind, string> = {
  even_odd: "Last digit is even or odd",
  matches_differs: "Last digit matches a specific digit",
  over_under: "Last digit over or under a threshold",
  rise_fall: "Predict tick direction",
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
  const [botRefreshKey, setBotRefreshKey] = useState(0);
  const [botLastAnalysisAt, setBotLastAnalysisAt] = useState<Date | null>(null);
  const [launchingPresetId, setLaunchingPresetId] = useState<string | null>(null);

  // Manual Trader state
  const [manualKind, setManualKind] = useState<ManualContractKind | null>(null);
  const [manualSuggestions, setManualSuggestions] = useState<ManualMarketSuggestion[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [manualLastAnalysisAt, setManualLastAnalysisAt] = useState<Date | null>(null);

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

  // ── Best Bot analysis effect ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open || tab !== "best-bot") return;
    let cancelled = false;
    setBotLoading(true);
    setBotError(null);
    analyzeBestBotOpportunities()
      .then((result) => {
        if (cancelled) return;
        setBotOpportunities(result);
        setBotLastAnalysisAt(new Date());
        recordActivity(user?.id, {
          message: `AI bot scan: ${result.length} presets ranked.`,
          meta: { view: "best-bot" },
          type: "assistant",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setBotError(err instanceof Error ? err.message : "Analysis could not be completed.");
      })
      .finally(() => {
        if (!cancelled) setBotLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, tab, botRefreshKey, user?.id]);

  // ── Manual analysis effect ───────────────────────────────────────────────────

  useEffect(() => {
    if (!open || tab !== "manual" || !manualKind) return;
    let cancelled = false;
    setManualLoading(true);
    setManualError(null);
    analyzeBestMarketForContract(manualKind)
      .then((result) => {
        if (cancelled) return;
        setManualSuggestions(result);
        setManualLastAnalysisAt(new Date());
        recordActivity(user?.id, {
          message: `AI manual scan: ${manualKind.replace("_", "/")} across ${result.length} markets.`,
          meta: { kind: manualKind, view: "manual" },
          type: "assistant",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setManualError(err instanceof Error ? err.message : "Analysis could not be completed.");
      })
      .finally(() => {
        if (!cancelled) setManualLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, tab, manualKind, manualRefreshKey, user?.id]);

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
    if (!stakeRecommendation) {
      toast.error("Could not compute stake recommendation.");
      return;
    }
    setLaunchingPresetId(bot.presetId);
    try {
      await deployBotFromAiSuggestion({
        userId: user.id,
        presetId: bot.presetId,
        stake: stakeRecommendation.stake,
        martingale: stakeRecommendation.martingale,
      });
      toast.success(`${bot.name} deployed with AI-recommended settings.`);
      setOpen(false);
      await navigate({ to: "/bot-builder" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy bot.");
    } finally {
      setLaunchingPresetId(null);
    }
  }

  function handleLaunchManualTrader() {
    if (!topManual || !manualKind || !manualStakeAdvice) return;
    const tradeTypeMap: Record<ManualContractKind, string> = {
      even_odd: "even_odd",
      matches_differs: "matches_differs",
      over_under: "over_under",
      rise_fall: "rise_fall",
    };
    setManualTradePickup({
      symbol: topManual.symbol,
      tradeType: tradeTypeMap[manualKind] as TradeCategory,
      stake: manualStakeAdvice.stake,
    });
    rememberMarketSelection(user?.id, "manual", topManual.symbol);
    toast.success(`Navigating to Manual Trader with ${topManual.marketLabel} pre-selected.`);
    setOpen(false);
    void navigate({ to: "/" });
  }

  function handleManualKindChange(kind: ManualContractKind | null) {
    setManualKind(kind);
    setManualSuggestions([]);
    setManualError(null);
    setManualLastAnalysisAt(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const lastAnalysisAt = tab === "best-bot" ? botLastAnalysisAt : manualLastAnalysisAt;

  return (
    <>
      {open && (
        <aside
          className="fixed z-50 overflow-hidden rounded-2xl border border-[#d7dce0] bg-white shadow-2xl dark:border-[#2a2f35] dark:bg-[#101214]"
          style={panelStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e7eaee] px-4 py-3 dark:border-[#24282d]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold">
                <BrainCircuit className="size-4 text-[#4bb4b3]" />
                <span className="truncate">AI Market Assistant</span>
              </div>
              <div className="truncate text-[11px] text-[#6b7280] dark:text-[#aab1b8]">
                {lastAnalysisAt
                  ? `Updated ${lastAnalysisAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${tab === "best-bot" && topBot ? ` · ${topBot.marketLabel}` : tab === "manual" && topManual ? ` · ${topManual.marketLabel}` : ""}`
                  : `Market: ${currentMarket}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (tab === "best-bot") setBotRefreshKey((k) => k + 1);
                  else if (tab === "manual") setManualRefreshKey((k) => k + 1);
                }}
                disabled={tab === "memory"}
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
          <div className="flex gap-2 overflow-x-auto border-b border-[#e7eaee] px-3 py-2 dark:border-[#24282d]">
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
          <div className="h-[calc(100%-7.25rem)] overflow-y-auto px-4 py-4 text-sm">
            {tab === "best-bot" && (
              <BestBotView
                loading={botLoading}
                error={botError}
                opportunities={botOpportunities}
                stakeRecommendation={stakeRecommendation}
                balance={balance}
                currency={currency ?? "USD"}
                launchingPresetId={launchingPresetId}
                onLaunch={handleLaunchBestBot}
                onRerun={() => setBotRefreshKey((k) => k + 1)}
              />
            )}

            {tab === "manual" && (
              <ManualTraderView
                loading={manualLoading}
                error={manualError}
                kind={manualKind}
                suggestions={manualSuggestions}
                stakeAdvice={manualStakeAdvice}
                currency={currency ?? "USD"}
                onKindChange={handleManualKindChange}
                onLaunch={handleLaunchManualTrader}
                onRerun={() => setManualRefreshKey((k) => k + 1)}
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
  loading,
  error,
  opportunities,
  stakeRecommendation,
  balance,
  currency,
  launchingPresetId,
  onLaunch,
  onRerun,
}: {
  loading: boolean;
  error: string | null;
  opportunities: BotOpportunity[];
  stakeRecommendation: StakeRecommendation | null;
  balance: number;
  currency: string;
  launchingPresetId: string | null;
  onLaunch: (bot: BotOpportunity) => void;
  onRerun: () => void;
}) {
  const topBot = opportunities[0] ?? null;
  const rest = opportunities.slice(1, 5);

  if (loading) {
    return (
      <LoadingCard message="Scanning all bot presets across live markets…" />
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorCard message={error} />
        <RerunButton onRerun={onRerun} loading={loading} />
        <AccuracyDisclaimer />
      </div>
    );
  }

  if (!topBot) {
    return (
      <div className="space-y-3">
        <InfoCard title="No data yet">
          Click Rerun to start the bot analysis.
        </InfoCard>
        <RerunButton onRerun={onRerun} loading={loading} />
        <AccuracyDisclaimer />
      </div>
    );
  }

  return (
    <div className="space-y-3">
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

      {/* Launch button */}
      {topBot.launchable && stakeRecommendation && (
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
          Launch on {topBot.marketLabel}
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

      <RerunButton onRerun={onRerun} loading={loading} />
      <AccuracyDisclaimer />
    </div>
  );
}

// ─── Manual Trader view ───────────────────────────────────────────────────────

function ManualTraderView({
  loading,
  error,
  kind,
  suggestions,
  stakeAdvice,
  currency,
  onKindChange,
  onLaunch,
  onRerun,
}: {
  loading: boolean;
  error: string | null;
  kind: ManualContractKind | null;
  suggestions: ManualMarketSuggestion[];
  stakeAdvice: ManualStakeRecommendation | null;
  currency: string;
  onKindChange: (kind: ManualContractKind | null) => void;
  onLaunch: () => void;
  onRerun: () => void;
}) {
  const topMarket = suggestions[0] ?? null;
  const rest = suggestions.slice(1, 7);

  if (!kind) {
    return (
      <div className="space-y-3">
        <InfoCard title="Choose a contract family">
          Select the type of contract you want to trade. The AI will scan all 10 synthetic digit
          markets and recommend the strongest setup.
        </InfoCard>
        <div className="grid grid-cols-2 gap-2">
          {(["even_odd", "over_under", "matches_differs", "rise_fall"] as ManualContractKind[]).map(
            (k) => (
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
            ),
          )}
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

      {loading && <LoadingCard message={`Scanning 10 markets for ${MANUAL_KIND_LABELS[kind]} edge…`} />}
      {!loading && error && <ErrorCard message={error} />}

      {!loading && !error && topMarket && (
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
            Launch on Manual Trader
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

      {!loading && !error && !topMarket && kind && (
        <InfoCard title="No results">
          Click the Rerun button to scan markets.
        </InfoCard>
      )}

      {!loading && <RerunButton onRerun={onRerun} loading={loading} />}
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

function RerunButton({ onRerun, loading }: { onRerun: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onRerun}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d7dce0] bg-white px-4 py-2 text-xs font-semibold text-[#42505b] transition hover:border-[#4bb4b3] hover:bg-[#eef9f8] hover:text-[#0f766e] disabled:opacity-50 dark:border-[#2a2f35] dark:bg-[#141719] dark:text-[#c9d0d7] dark:hover:border-[#4bb4b3] dark:hover:bg-[#102726] dark:hover:text-[#8be6e4]"
    >
      <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
      Rerun analysis
    </button>
  );
}

function AccuracyDisclaimer() {
  return (
    <div className="flex gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e] dark:border-[#4a3310] dark:bg-[#221c0d] dark:text-[#fcd34d]">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Synthetic indices are RNG-driven and do not react to news or events. This analysis
        shows statistical bias over the last 200 ticks — it is a signal, not a guarantee.
        Edge values of 0–3% are typical noise; always trade within your risk tolerance.
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

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#d8e7e6] bg-[#eef9f8] p-3 text-sm text-[#245a58] dark:border-[#1f403f] dark:bg-[#102726] dark:text-[#9ee5e3]">
      <Loader2 className="size-4 shrink-0 animate-spin" />
      <span>{message}</span>
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
