import { useEffect, useRef, useState } from "react";
import { MarketSelector } from "@/components/market-selector";

// Maps internal synthetic index symbols to TradingView symbols
const TV_SYMBOL_MAP: Record<string, string> = {
  R_10: "FX:EURUSD",
  R_25: "FX:GBPUSD",
  R_50: "TVC:DXY",
  R_75: "CAPITALCOM:US500",
  R_100: "CAPITALCOM:US100",
  "1HZ10V": "FX:AUDUSD",
  "1HZ25V": "FX:USDJPY",
  "1HZ50V": "FX:USDCAD",
  "1HZ75V": "CAPITALCOM:UK100",
  "1HZ100V": "BINANCE:BTCUSDT",
  BOOM500: "CAPITALCOM:DE40",
  BOOM1000: "TVC:GOLD",
  CRASH500: "TVC:SILVER",
  CRASH1000: "NASDAQ:AAPL",
  stpRNG: "NYSE:SPY",
  RDBEAR: "BINANCE:ETHUSDT",
  RDBULL: "CAPITALCOM:US500",
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: Array<() => void> = [];

function loadTvScript(onReady: () => void) {
  if (scriptLoaded) { onReady(); return; }
  loadCallbacks.push(onReady);
  if (scriptLoading) return;
  scriptLoading = true;
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/tv.js";
  script.async = true;
  script.onload = () => {
    scriptLoaded = true;
    scriptLoading = false;
    loadCallbacks.forEach((cb) => cb());
    loadCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

interface TvChartProps {
  symbol?: string;
  height?: number;
  onSymbolChange?: (symbol: string) => void;
  showSymbolSelector?: boolean;
  compact?: boolean;
  className?: string;
}

export function TvChart({
  symbol = "1HZ100V",
  height = 380,
  onSymbolChange,
  showSymbolSelector = false,
  compact = false,
  className,
}: TvChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const prevSymbolRef = useRef<string | null>(null);

  // Load the TradingView script once
  useEffect(() => {
    if (typeof window === "undefined") return;
    loadTvScript(() => setReady(true));
  }, []);

  // Build or rebuild the widget whenever symbol or height changes
  useEffect(() => {
    if (!ready || !containerRef.current || !window.TradingView) return;
    const tvSymbol = TV_SYMBOL_MAP[symbol] ?? "FX:EURUSD";
    if (prevSymbolRef.current === tvSymbol) return;
    prevSymbolRef.current = tvSymbol;

    // Remove existing widget
    if (widgetRef.current?.remove) widgetRef.current.remove();
    containerRef.current.innerHTML = "";

    const containerId = `tv_chart_${Math.random().toString(36).slice(2, 8)}`;
    const inner = document.createElement("div");
    inner.id = containerId;
    inner.style.width = "100%";
    inner.style.height = `${height}px`;
    containerRef.current.appendChild(inner);

    widgetRef.current = new window.TradingView.widget({
      autosize: false,
      width: "100%",
      height,
      symbol: tvSymbol,
      interval: "1",
      timezone: "Etc/UTC",
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      style: "1",
      locale: "en",
      toolbar_bg: "transparent",
      enable_publishing: false,
      hide_side_toolbar: compact,
      allow_symbol_change: false,
      container_id: containerId,
      hide_top_toolbar: compact,
      hide_legend: compact,
      save_image: false,
      withdateranges: !compact,
    });
  }, [ready, symbol, height, compact]);

  // Sync height changes without full rebuild
  useEffect(() => {
    if (!containerRef.current) return;
    const inner = containerRef.current.querySelector("div") as HTMLDivElement | null;
    if (inner) inner.style.height = `${height}px`;
  }, [height]);

  return (
    <div className={`relative flex flex-col gap-1 ${className ?? ""}`}>
      {showSymbolSelector && (
        <div className="flex items-center gap-2">
          <MarketSelector value={symbol} onChange={onSymbolChange ?? (() => {})} />
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ minHeight: height }} />
      {!showSymbolSelector && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Connected
        </div>
      )}
    </div>
  );
}
