import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Maximize2, Minimize2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DerivChart } from "@/components/deriv-chart";
import { TopShell } from "@/components/top-shell";
import { TradePanel } from "@/components/trade-panel";
import { useAuth } from "@/hooks/use-auth";
import { readRememberedMarket, rememberMarketSelection } from "@/lib/activity-memory";
import type { TradeCategory } from "@/lib/deriv";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArkTrader Hub - Real-time Trading Platform" },
      {
        name: "description",
        content: "Trade synthetic indices in real time with live charts, bots, analytics, and copy trading.",
      },
    ],
  }),
  component: Index,
});

function computeChartHeight() {
  if (typeof window === "undefined") return 380;
  const narrow = window.innerWidth < 640;
  return narrow ? 200 : Math.max(380, window.innerHeight - 320);
}

function Index() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState(
    () => readRememberedMarket(undefined, "manual", "1HZ100V") ?? "1HZ100V",
  );
  const [price, setPrice] = useState<number | null>(null);
  const [tradeType, setTradeType] = useState<TradeCategory>("accumulator");
  const [barriers, setBarriers] = useState<{
    breached?: boolean;
    entry: number | null;
    high: number | null;
    low: number | null;
    profit: number | null;
    profitCurrency?: string;
    profitStatus?: "active" | "lost" | "sold" | null;
  }>({
    entry: null,
    high: null,
    low: null,
    profit: null,
    profitStatus: null,
  });
  const lossOverlayTimerRef = useRef<number | null>(null);
  const barrierFlashTimerRef = useRef<number | null>(null);
  const breachedRef = useRef(false);
  const lossOverlayDismissedRef = useRef(false);
  const isMobile = useIsMobile();
  const [chartHeight, setChartHeight] = useState(() => computeChartHeight());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const remembered = readRememberedMarket(user?.id, "manual");
    if (!remembered) return;
    setSymbol((current) => (current === remembered ? current : remembered));
  }, [user?.id]);

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextHeight = computeChartHeight();
        setChartHeight((current) => (current === nextHeight ? current : nextHeight));
      });
    };
    compute();
    window.addEventListener("resize", compute, { passive: true });
    window.addEventListener("orientationchange", compute);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (lossOverlayTimerRef.current !== null) window.clearTimeout(lossOverlayTimerRef.current);
      if (barrierFlashTimerRef.current !== null) window.clearTimeout(barrierFlashTimerRef.current);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* user dismissed */ }
  }, []);

  const handleMarketChange = useCallback(
    (nextSymbol: string) => {
      setSymbol(nextSymbol);
      rememberMarketSelection(user?.id, "manual", nextSymbol);
    },
    [user?.id],
  );

  const handleAccumulatorBarriers = useCallback(
    (next: {
      breached?: boolean;
      entry: number | null;
      high: number | null;
      low: number | null;
      profit?: number | null;
      profitCurrency?: string;
      profitStatus?: "active" | "lost" | "sold" | null;
    }) => {
      const nextStatus = next.profitStatus ?? null;
      const justBreached = Boolean(next.breached) && !breachedRef.current;
      breachedRef.current = Boolean(next.breached);

      // Clear existing overlay timer when status changes away from a flash state
      const isFlashStatus = nextStatus === "lost" || nextStatus === "sold" || nextStatus === null;
      if (isFlashStatus && lossOverlayTimerRef.current !== null) {
        window.clearTimeout(lossOverlayTimerRef.current);
        lossOverlayTimerRef.current = null;
      }
      if (isFlashStatus) lossOverlayDismissedRef.current = false;

      if (justBreached) {
        if (barrierFlashTimerRef.current !== null) window.clearTimeout(barrierFlashTimerRef.current);
        barrierFlashTimerRef.current = window.setTimeout(() => {
          barrierFlashTimerRef.current = null;
          setBarriers((current) => ({ ...current, breached: false }));
        }, 1250);
      }

      // "sold" accumulator: show final profit for 2 s then clear
      if (nextStatus === "sold") {
        const finalProfit = next.profit ?? null;
        const showAsWin = (finalProfit ?? 0) >= 0;
        setBarriers((current) => ({
          ...current, ...next,
          breached: justBreached ? true : current.breached,
          profit: finalProfit,
          profitStatus: showAsWin ? "active" : "lost",
        }));
        lossOverlayTimerRef.current = window.setTimeout(() => {
          lossOverlayTimerRef.current = null;
          setBarriers((current) => ({ ...current, profit: null, profitStatus: null }));
        }, 2000);
        return;
      }

      const suppressLostOverlay = nextStatus === "lost" && lossOverlayDismissedRef.current;
      setBarriers((current) => ({
        ...current, ...next,
        breached: justBreached ? true : current.breached,
        profit: suppressLostOverlay ? null : (next.profit ?? null),
        profitStatus: suppressLostOverlay ? null : nextStatus,
      }));

      // Auto-clear "lost" flash after 2 s (accumulator lost or non-accumulator loss)
      if (nextStatus === "lost" && !lossOverlayDismissedRef.current && lossOverlayTimerRef.current === null) {
        lossOverlayTimerRef.current = window.setTimeout(() => {
          lossOverlayTimerRef.current = null;
          lossOverlayDismissedRef.current = true;
          setBarriers((current) => ({ ...current, profit: null, profitStatus: null }));
        }, 2000);
      }
    },
    [],
  );

  void tradeType;

  return (
    <TopShell>
      <div
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden"
        style={{
          gridTemplateRows: isMobile ? "minmax(0, 224px) minmax(0, 1fr)" : undefined,
          height: isMobile ? "calc(100dvh - 11rem)" : "calc(100dvh - 12rem)",
        }}
      >
        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-[oklch(0.92_0.005_240)] bg-white lg:border-b-0 lg:border-r dark:border-[#242424] dark:bg-[#151515]">
          <div className="hidden shrink-0 items-center justify-between px-3 py-2 sm:px-4 md:flex">
            <div>
              <div className="text-sm font-semibold">Manual Trader</div>
              <div className="font-mono text-[11px] text-[oklch(0.55_0.02_260)] dark:text-[#999999]">
                {price !== null ? price.toFixed(4) : "-"}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-hidden bg-card p-2 text-card-foreground sm:p-3 dark:bg-[#101010]">
            <DerivChart
              symbol={symbol}
              onSymbolChange={handleMarketChange}
              onPrice={setPrice}
              height={chartHeight}
              entryPrice={barriers.entry}
              highBarrier={barriers.high}
              lowBarrier={barriers.low}
              barrierBreached={barriers.breached}
              accumulatorProfit={barriers.profit}
              accumulatorProfitCurrency={barriers.profitCurrency}
              accumulatorProfitStatus={barriers.profitStatus}
              compact={isMobile}
            />
          </div>
        </section>
        <aside className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden bg-[oklch(0.97_0.003_240)] p-1.5 pb-1.5 sm:p-3 lg:overflow-y-auto lg:pb-3 dark:bg-[#0e0e0e]">
          <TradePanel
            market={symbol}
            lastPrice={price}
            onAccumulatorBarriers={handleAccumulatorBarriers}
            onMarketChange={handleMarketChange}
            onTradeTypeChange={setTradeType}
            showMarketSelector={false}
          />
        </aside>
      </div>
      <div className="hidden flex-wrap items-center justify-between gap-2 border-t border-[oklch(0.92_0.005_240)] bg-white px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 md:flex dark:border-[#242424] dark:bg-[#151515]">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[oklch(0.45_0.02_260)] sm:gap-3 dark:text-[#999999]">
          <Link
            to="/bot-builder"
            aria-label="Open bot builder"
            title="Bot Builder"
            className="rounded-md p-1.5 transition-colors hover:bg-[#f2f3f4] hover:text-[#333333] dark:hover:bg-[#1f1f1f] dark:hover:text-white"
          >
            <Bot className="size-4" />
          </Link>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
            className="rounded-md p-1.5 transition-colors hover:bg-[#f2f3f4] hover:text-[#333333] dark:hover:bg-[#1f1f1f] dark:hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
    </TopShell>
  );
}
