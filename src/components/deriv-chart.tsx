import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  createChart,
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  fetchCandles,
  fetchTicks,
  onStatus,
  subscribeTicks,
  type ConnectionStatus,
  type Candle,
} from "@/lib/deriv";
import { MarketSelector } from "@/components/market-selector";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateDigitStats, digitsFromPrices, lastDigitFromPrice } from "@/lib/digit-stats";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CirclePlus,
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  LockKeyhole,
  Magnet,
  Network,
  Paintbrush,
  PencilLine,
  Ruler,
  SlidersHorizontal,
  Smile,
  Spline,
  Trash2,
  Type,
  UnlockKeyhole,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearBarrierLines, renderBarrierLines, type BarrierLineRefs } from "@/lib/chart-barriers";

type ChartType = "area" | "candle" | "bar";
type ChartDrawingTool =
  | "pointer"
  | "trend"
  | "horizontal"
  | "fibonacci"
  | "brush"
  | "text"
  | "emoji"
  | "measure";
type AnalysisTool =
  | "sma"
  | "ema"
  | "wma"
  | "bollinger"
  | "donchian"
  | "psar"
  | "highlow"
  | "rsi"
  | "macd"
  | "stochastic"
  | "cci"
  | "williams_r"
  | "awesome"
  | "atr";

type IndicatorCategory = "Trend" | "Momentum" | "Volatility" | "Reference";

type IndicatorDef = {
  value: AnalysisTool;
  label: string;
  description: string;
  category: IndicatorCategory;
};

type DrawingPoint = {
  x: number;
  y: number;
};

type ChartDrawing = {
  id: string;
  points: DrawingPoint[];
  text?: string;
  tool: ChartDrawingTool;
};

type AccumulatorBarrierBand = {
  bottom: number;
  entryY: number | null;
  left: number;
  lowerLabel: string;
  right: number;
  top: number;
  upperLabel: string;
};

type ChartToolDef = {
  icon: LucideIcon;
  label: string;
  tool: ChartDrawingTool;
};

type ResolvedTheme = "dark" | "light";

type ChartPalette = {
  areaBottomColor: string;
  areaLineColor: string;
  areaTopColor: string;
  gridColor: string;
  priceLineColor: string;
  scaleBorderColor: string;
  textColor: string;
};

type Props = {
  symbol: string;
  onSymbolChange?: (s: string) => void;
  onPrice?: (price: number) => void;
  height?: number;
  className?: string;
  entryPrice?: number | null;
  highBarrier?: number | null;
  lowBarrier?: number | null;
  barrierBreached?: boolean;
  accumulatorProfit?: number | null;
  accumulatorProfitCurrency?: string;
  accumulatorProfitStatus?: "active" | "lost" | "sold" | null;
  showDigitStats?: boolean;
  showSymbolSelector?: boolean;
  compact?: boolean;
};

const TIMEFRAMES = [
  { label: "Tick", value: 0 },
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "3m", value: 180 },
  { label: "5m", value: 300 },
  { label: "10m", value: 600 },
  { label: "15m", value: 900 },
  { label: "30m", value: 1800 },
  { label: "1H", value: 3600 },
  { label: "2H", value: 7200 },
  { label: "4H", value: 14400 },
  { label: "8H", value: 28800 },
  { label: "1D", value: 86400 },
];

const INDICATORS: IndicatorDef[] = [
  // Trend (overlay on price)
  { value: "sma", label: "SMA", description: "Simple Moving Average (20)", category: "Trend" },
  { value: "ema", label: "EMA", description: "Exponential Moving Average (20)", category: "Trend" },
  { value: "wma", label: "WMA", description: "Weighted Moving Average (20)", category: "Trend" },
  { value: "bollinger", label: "Bollinger Bands", description: "Period 20, 2σ", category: "Trend" },
  {
    value: "donchian",
    label: "Donchian Channel",
    description: "Period 20 high/low channel",
    category: "Trend",
  },
  { value: "psar", label: "Parabolic SAR", description: "Step 0.02, max 0.2", category: "Trend" },
  // Momentum (own pane)
  { value: "rsi", label: "RSI", description: "Relative Strength Index (14)", category: "Momentum" },
  { value: "macd", label: "MACD", description: "12 / 26 / 9", category: "Momentum" },
  { value: "stochastic", label: "Stochastic", description: "%K/%D (14, 3)", category: "Momentum" },
  { value: "cci", label: "CCI", description: "Commodity Channel Index (20)", category: "Momentum" },
  { value: "williams_r", label: "Williams %R", description: "Period 14", category: "Momentum" },
  {
    value: "awesome",
    label: "Awesome Oscillator",
    description: "(5,34) histogram",
    category: "Momentum",
  },
  // Volatility (own pane)
  { value: "atr", label: "ATR", description: "Average True Range (14)", category: "Volatility" },
  // Reference (overlay)
  {
    value: "highlow",
    label: "Period High / Low",
    description: "Visible-range high/low markers",
    category: "Reference",
  },
];

const INDICATOR_CATEGORIES: IndicatorCategory[] = ["Trend", "Momentum", "Volatility", "Reference"];

const DRAWING_TOOLS: ChartToolDef[] = [
  { tool: "trend", label: "Trend line", icon: Spline },
  { tool: "horizontal", label: "Horizontal level", icon: SlidersHorizontal },
  { tool: "fibonacci", label: "Fibonacci retracement", icon: Network },
  { tool: "brush", label: "Brush", icon: Paintbrush },
  { tool: "text", label: "Text", icon: Type },
  { tool: "emoji", label: "Emoji", icon: Smile },
  { tool: "measure", label: "Ruler", icon: Ruler },
];

const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const STATUS_STYLE: Record<ConnectionStatus, string> = {
  connecting: "bg-yellow-400/20 text-yellow-600",
  connected: "bg-green-500/20 text-green-600",
  reconnecting: "bg-orange-500/20 text-orange-600",
  disconnected: "bg-red-500/20 text-red-600",
};

function readResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function chartPaletteForTheme(theme: ResolvedTheme): ChartPalette {
  if (theme === "dark") {
    return {
      areaBottomColor: "rgba(75,180,179,0)",
      areaLineColor: "#4bb4b3",
      areaTopColor: "rgba(75,180,179,0.22)",
      gridColor: "rgba(230,230,230,0.08)",
      priceLineColor: "#4bb4b3",
      scaleBorderColor: "rgba(230,230,230,0.16)",
      textColor: "rgba(230,230,230,0.88)",
    };
  }

  return {
    areaBottomColor: "rgba(31,41,55,0)",
    areaLineColor: "#1f2937",
    areaTopColor: "rgba(31,41,55,0.18)",
    gridColor: "rgba(120,120,140,0.08)",
    priceLineColor: "#111827",
    scaleBorderColor: "rgba(120,120,140,0.15)",
    textColor: "rgba(82,82,96,0.9)",
  };
}

function applyChartAppearance(chart: IChartApi, palette: ChartPalette, granularity: number) {
  chart.applyOptions({
    layout: {
      background: { color: "transparent" },
      textColor: palette.textColor,
      fontFamily: "Inter, system-ui, sans-serif",
    },
    grid: {
      vertLines: { color: palette.gridColor },
      horzLines: { color: palette.gridColor },
    },
    rightPriceScale: { borderColor: palette.scaleBorderColor },
    timeScale: {
      borderColor: palette.scaleBorderColor,
      timeVisible: true,
      secondsVisible: granularity < 60,
    },
  });
}

export function DerivChart({
  symbol,
  onSymbolChange,
  onPrice,
  height = 420,
  className,
  entryPrice,
  highBarrier,
  lowBarrier,
  barrierBreached,
  accumulatorProfit,
  accumulatorProfitCurrency,
  accumulatorProfitStatus,
  showDigitStats,
  showSymbolSelector = true,
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const barSeriesRef = useRef<ISeriesApi<"Bar"> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const highLowLineRefs = useRef<IPriceLine[]>([]);
  const barrierLineRefs = useRef<BarrierLineRefs>({ entry: null, lower: null, upper: null });
  const analysisOverlayFrameRef = useRef<number | null>(null);
  const candleBufferRef = useRef<Map<number, Candle>>(new Map());
  const historyRef = useRef<LineData[]>([]);
  const candleHistoryRef = useRef<Candle[]>([]);
  const digitHistoryRef = useRef<number[]>([]);
  const showDigitStatsRef = useRef(showDigitStats);

  const [granularity, setGranularity] = useState(0);
  const [chartType, setChartType] = useState<ChartType>("area");
  const [analysisTools, setAnalysisTools] = useState<Set<AnalysisTool>>(new Set());
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [crosshairOn, setCrosshairOn] = useState(true);
  const [activeDrawingTool, setActiveDrawingTool] = useState<ChartDrawingTool>("pointer");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draftDrawing, setDraftDrawing] = useState<ChartDrawing | null>(null);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [magnetOn, setMagnetOn] = useState(false);
  const [accumulatorBand, setAccumulatorBand] = useState<AccumulatorBarrierBand | null>(null);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => readResolvedTheme());
  const chartPalette = useMemo(() => chartPaletteForTheme(resolvedTheme), [resolvedTheme]);

  const baseSeriesGetter = useCallback(
    () => areaSeriesRef.current ?? candleSeriesRef.current ?? barSeriesRef.current,
    [],
  );
  const [digitStats, setDigitStats] = useState<{
    latest: number | null;
    percentages: number[];
  }>({ latest: null, percentages: Array.from({ length: 10 }, () => 0) });
  const analysisToolsRef = useRef(analysisTools);

  useEffect(() => {
    analysisToolsRef.current = analysisTools;
  }, [analysisTools]);

  useEffect(() => {
    showDigitStatsRef.current = showDigitStats;
  }, [showDigitStats]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const syncTheme = () => setResolvedTheme(readResolvedTheme());
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (analysisOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(analysisOverlayFrameRef.current);
        analysisOverlayFrameRef.current = null;
      }
    },
    [],
  );

  const clearAnalysisOverlays = useCallback(() => {
    const chart = chartRef.current;
    indicatorSeriesRef.current.forEach((series) => {
      try {
        chart?.removeSeries(series);
      } catch {
        /* ignore */
      }
    });
    indicatorSeriesRef.current = [];
    const baseSeries = baseSeriesGetter();
    highLowLineRefs.current.forEach((line) => {
      try {
        baseSeries?.removePriceLine(line);
      } catch {
        /* ignore */
      }
    });
    highLowLineRefs.current = [];
  }, [baseSeriesGetter]);

  const updateAnalysisOverlays = useCallback(() => {
    const chart = chartRef.current;
    const data = historyRef.current;
    const candleHistory = candleHistoryRef.current;
    const baseSeries = baseSeriesGetter();
    const tools = analysisToolsRef.current;
    if (!chart || !baseSeries) return;
    clearAnalysisOverlays();
    if (!data.length || tools.size === 0) return;

    if (tools.has("sma")) {
      const series = chart.addSeries(LineSeries, {
        color: "#2563eb",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(movingAverage(data, 20));
      indicatorSeriesRef.current.push(series);
    }
    if (tools.has("ema")) {
      const series = chart.addSeries(LineSeries, {
        color: "#9333ea",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(exponentialAverage(data, 20));
      indicatorSeriesRef.current.push(series);
    }
    if (tools.has("wma")) {
      const series = chart.addSeries(LineSeries, {
        color: "#0d9488",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(weightedAverage(data, 20));
      indicatorSeriesRef.current.push(series);
    }
    if (tools.has("donchian") && candleHistory.length > 0) {
      const { upper, lower } = donchianChannel(candleHistory, 20);
      const upperSeries = chart.addSeries(LineSeries, {
        color: "#16a34a",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const lowerSeries = chart.addSeries(LineSeries, {
        color: "#dc2626",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      upperSeries.setData(upper);
      lowerSeries.setData(lower);
      indicatorSeriesRef.current.push(upperSeries, lowerSeries);
    }
    if (tools.has("psar") && candleHistory.length > 0) {
      const series = chart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(parabolicSar(candleHistory, 0.02, 0.2));
      indicatorSeriesRef.current.push(series);
    }
    if (tools.has("bollinger")) {
      const [upper, lower] = bollingerBands(data, 20);
      const upperSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const lowerSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      upperSeries.setData(upper);
      lowerSeries.setData(lower);
      indicatorSeriesRef.current.push(upperSeries, lowerSeries);
    }
    if (tools.has("highlow")) {
      const values = data.map((point) => point.value);
      const high = Math.max(...values);
      const low = Math.min(...values);
      highLowLineRefs.current = [
        baseSeries.createPriceLine({
          price: high,
          color: "#ef4444",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "High",
        }),
        baseSeries.createPriceLine({
          price: low,
          color: "#22c55e",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Low",
        }),
      ];
    }
    // Oscillator panes — each oscillator gets its own pane below the price
    // pane (pane index 1+). Lightweight-charts v5 manages pane stretching
    // automatically; users can resize via the pane separator.
    let oscillatorPaneIndex = 1;
    if (tools.has("rsi")) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#0ea5e9",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        },
        oscillatorPaneIndex,
      );
      series.setData(relativeStrengthIndex(data, 14));
      series.createPriceLine({
        price: 70,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "70",
      });
      series.createPriceLine({
        price: 30,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "30",
      });
      indicatorSeriesRef.current.push(series);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("macd")) {
      const { macd, signal } = macdSeries(data, 12, 26, 9);
      const macdLine = chart.addSeries(
        LineSeries,
        {
          color: "#2563eb",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        oscillatorPaneIndex,
      );
      const signalLine = chart.addSeries(
        LineSeries,
        {
          color: "#ef4444",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        oscillatorPaneIndex,
      );
      macdLine.setData(macd);
      signalLine.setData(signal);
      indicatorSeriesRef.current.push(macdLine, signalLine);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("stochastic")) {
      const { k, d } = stochasticSeries(data, 14, 3);
      const kLine = chart.addSeries(
        LineSeries,
        {
          color: "#9333ea",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        },
        oscillatorPaneIndex,
      );
      const dLine = chart.addSeries(
        LineSeries,
        {
          color: "#f59e0b",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        },
        oscillatorPaneIndex,
      );
      kLine.setData(k);
      dLine.setData(d);
      kLine.createPriceLine({
        price: 80,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "80",
      });
      kLine.createPriceLine({
        price: 20,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "20",
      });
      indicatorSeriesRef.current.push(kLine, dLine);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("cci") && candleHistory.length > 0) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#14b8a6",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        },
        oscillatorPaneIndex,
      );
      series.setData(commodityChannelIndex(candleHistory, 20));
      series.createPriceLine({
        price: 100,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "+100",
      });
      series.createPriceLine({
        price: -100,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "-100",
      });
      indicatorSeriesRef.current.push(series);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("williams_r") && candleHistory.length > 0) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#a855f7",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        },
        oscillatorPaneIndex,
      );
      series.setData(williamsR(candleHistory, 14));
      series.createPriceLine({
        price: -20,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "-20",
      });
      series.createPriceLine({
        price: -80,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "-80",
      });
      indicatorSeriesRef.current.push(series);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("awesome") && candleHistory.length > 0) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#eab308",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        oscillatorPaneIndex,
      );
      series.setData(awesomeOscillator(candleHistory, 5, 34));
      series.createPriceLine({
        price: 0,
        color: "#9ca3af",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: "0",
      });
      indicatorSeriesRef.current.push(series);
      oscillatorPaneIndex += 1;
    }
    if (tools.has("atr") && candleHistory.length > 0) {
      const series = chart.addSeries(
        LineSeries,
        {
          color: "#ef4444",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        oscillatorPaneIndex,
      );
      series.setData(averageTrueRange(candleHistory, 14));
      indicatorSeriesRef.current.push(series);
      oscillatorPaneIndex += 1;
    }
  }, [baseSeriesGetter, clearAnalysisOverlays]);

  const scheduleAnalysisOverlayUpdate = useCallback(() => {
    if (analysisToolsRef.current.size === 0) return;
    if (analysisOverlayFrameRef.current !== null) return;
    analysisOverlayFrameRef.current = window.requestAnimationFrame(() => {
      analysisOverlayFrameRef.current = null;
      updateAnalysisOverlays();
    });
  }, [updateAnalysisOverlays]);

  useEffect(() => {
    const off = onStatus(setStatus);
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (showDigitStats) {
      setDigitStats(calculateDigitStats(digitHistoryRef.current));
    }
  }, [showDigitStats]);

  // Build chart once; rebuild when chart type changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const initialPalette = chartPaletteForTheme(readResolvedTheme());

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: initialPalette.textColor,
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: initialPalette.gridColor },
        horzLines: { color: initialPalette.gridColor },
      },
      rightPriceScale: { borderColor: initialPalette.scaleBorderColor },
      timeScale: {
        borderColor: initialPalette.scaleBorderColor,
        timeVisible: true,
        secondsVisible: granularity < 60,
      },
      crosshair: { mode: CrosshairMode.Magnet },
    });

    if (chartType === "candle") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        priceLineVisible: true,
        lastValueVisible: true,
      });
      candleSeriesRef.current = series as ISeriesApi<"Candlestick">;
      areaSeriesRef.current = null;
      barSeriesRef.current = null;
    } else if (chartType === "bar") {
      const series = chart.addSeries(BarSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        thinBars: false,
        priceLineVisible: true,
        lastValueVisible: true,
      });
      barSeriesRef.current = series as ISeriesApi<"Bar">;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: initialPalette.areaLineColor,
        lineWidth: 2,
        topColor: initialPalette.areaTopColor,
        bottomColor: initialPalette.areaBottomColor,
        priceLineVisible: true,
        priceLineColor: initialPalette.priceLineColor,
        priceLineWidth: 1,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      areaSeriesRef.current = series as ISeriesApi<"Area">;
      candleSeriesRef.current = null;
      barSeriesRef.current = null;
    }

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      areaSeriesRef.current = null;
      candleSeriesRef.current = null;
      barSeriesRef.current = null;
      indicatorSeriesRef.current = [];
      highLowLineRefs.current = [];
      barrierLineRefs.current = { entry: null, lower: null, upper: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    applyChartAppearance(chart, chartPalette, granularity);
    areaSeriesRef.current?.applyOptions({
      bottomColor: chartPalette.areaBottomColor,
      lineColor: chartPalette.areaLineColor,
      priceLineColor: chartPalette.priceLineColor,
      topColor: chartPalette.areaTopColor,
    });
  }, [chartPalette, granularity]);

  // React to crosshair toggle without rebuilding the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      crosshair: { mode: crosshairOn ? CrosshairMode.Magnet : CrosshairMode.Hidden },
    });
  }, [crosshairOn]);

  const resetZoom = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  const zoomIn = useCallback(() => {
    const timeScale = chartRef.current?.timeScale();
    if (!timeScale) return;
    const range = timeScale.getVisibleLogicalRange();
    if (!range) {
      resetZoom();
      return;
    }
    const from = Number(range.from);
    const to = Number(range.to);
    const center = (from + to) / 2;
    const span = Math.max(6, (to - from) * 0.62);
    timeScale.setVisibleLogicalRange({
      from: center - span / 2,
      to: center + span / 2,
    });
  }, [resetZoom]);

  const updateAccumulatorBand = useCallback(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    const series = baseSeriesGetter();
    if (
      !chart ||
      !container ||
      !series ||
      highBarrier == null ||
      lowBarrier == null ||
      !Number.isFinite(highBarrier) ||
      !Number.isFinite(lowBarrier)
    ) {
      setAccumulatorBand(null);
      return;
    }

    const upperY = series.priceToCoordinate(highBarrier);
    const lowerY = series.priceToCoordinate(lowBarrier);
    const entryY =
      entryPrice != null && Number.isFinite(entryPrice)
        ? series.priceToCoordinate(entryPrice)
        : null;
    if (upperY == null || lowerY == null) {
      setAccumulatorBand(null);
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const latest = historyRef.current.at(-1);
    const latestX = latest ? chart.timeScale().timeToCoordinate(latest.time) : null;
    const left = clamp(
      latestX == null || !Number.isFinite(latestX) ? width * 0.74 : latestX,
      0,
      Math.max(0, width - 12),
    );
    const top = clamp(Math.min(upperY, lowerY), 0, height);
    const bottom = clamp(Math.max(upperY, lowerY), 0, height);

    setAccumulatorBand({
      bottom,
      entryY: entryY == null ? null : clamp(entryY, 0, height),
      left,
      lowerLabel: signedBarrierLabel(lowBarrier, entryPrice),
      right: width,
      top,
      upperLabel: signedBarrierLabel(highBarrier, entryPrice),
    });
  }, [baseSeriesGetter, entryPrice, highBarrier, lowBarrier]);

  useEffect(() => {
    updateAccumulatorBand();
  }, [barrierBreached, updateAccumulatorBand]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = () => updateAccumulatorBand();
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, [chartType, updateAccumulatorBand]);

  const handleDrawingPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (drawingsLocked || activeDrawingTool === "pointer") return;
      event.preventDefault();
      event.stopPropagation();
      const point = pointFromPointer(event, magnetOn);

      if (activeDrawingTool === "horizontal") {
        setDrawings((current) => [
          ...current,
          {
            id: createDrawingId(),
            points: [
              { x: 0, y: point.y },
              { x: 100, y: point.y },
            ],
            tool: "horizontal",
          },
        ]);
        return;
      }

      if (activeDrawingTool === "text" || activeDrawingTool === "emoji") {
        const label = window.prompt(
          activeDrawingTool === "text" ? "Text" : "Emoji",
          activeDrawingTool === "text" ? "Label" : ":)",
        );
        const text = label?.trim();
        if (!text) return;
        setDrawings((current) => [
          ...current,
          { id: createDrawingId(), points: [point], text, tool: activeDrawingTool },
        ]);
        return;
      }

      setDraftDrawing({
        id: createDrawingId(),
        points: activeDrawingTool === "brush" ? [point] : [point, point],
        tool: activeDrawingTool,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [activeDrawingTool, drawingsLocked, magnetOn],
  );

  const handleDrawingPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!draftDrawing || drawingsLocked) return;
      event.preventDefault();
      const point = pointFromPointer(event, magnetOn);
      setDraftDrawing((current) => {
        if (!current) return current;
        if (current.tool === "brush") {
          const previous = current.points.at(-1);
          if (previous && drawingDistance(previous, point) < 0.35) return current;
          return { ...current, points: [...current.points, point] };
        }
        return { ...current, points: [current.points[0], point] };
      });
    },
    [draftDrawing, drawingsLocked, magnetOn],
  );

  const handleDrawingPointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!draftDrawing) return;
      event.preventDefault();
      const isBrush = draftDrawing.tool === "brush";
      const first = draftDrawing.points[0];
      const last = draftDrawing.points.at(-1);
      const meaningful = isBrush
        ? draftDrawing.points.length > 2
        : first && last && drawingDistance(first, last) > 0.8;
      if (meaningful) {
        setDrawings((current) => [...current, draftDrawing]);
      }
      setDraftDrawing(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [draftDrawing],
  );

  // Load history + tick subscription on symbol/granularity/chartType change.
  useEffect(() => {
    let cancelled = false;
    let unsubTicks: (() => void) | undefined;
    candleBufferRef.current.clear();
    historyRef.current = [];
    candleHistoryRef.current = [];
    digitHistoryRef.current = [];

    const isOhlc = chartType === "candle" || chartType === "bar";

    async function init() {
      try {
        if (chartType === "area") {
          const ticks =
            granularity === 0
              ? await fetchTicks(symbol, 500)
              : (await fetchCandles(symbol, granularity, 300)).map((c) => ({
                  time: c.time,
                  value: c.close,
                }));
          if (cancelled) return;
          const data: LineData[] = ticks.map((point) => ({
            time: point.time as UTCTimestamp,
            value: point.value,
          }));
          historyRef.current = data;
          updateDigitStatsFromPrices(
            data.map((point) => point.value),
            digitHistoryRef,
            setDigitStats,
            showDigitStatsRef.current,
          );
          areaSeriesRef.current?.setData(data);
        } else if (isOhlc) {
          const candleGranularity = granularity || 60;
          const candles = await fetchCandles(symbol, candleGranularity, 300);
          if (cancelled) return;
          const data: CandlestickData[] = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          if (chartType === "candle") {
            candleSeriesRef.current?.setData(data);
          } else {
            barSeriesRef.current?.setData(data);
          }
          candles.forEach((c) => candleBufferRef.current.set(c.time, c));
          candleHistoryRef.current = candles;
          historyRef.current = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.close,
          }));
          updateDigitStatsFromPrices(
            candles.map((c) => c.close),
            digitHistoryRef,
            setDigitStats,
            showDigitStatsRef.current,
          );
        }
        updateAnalysisOverlays();
        chartRef.current?.timeScale().fitContent();
      } catch {
        /* network/timeout handled by status badge */
      }

      unsubTicks = await subscribeTicks(symbol, (price, t) => {
        if (cancelled) return;
        onPrice?.(price);
        const tickPoint = { time: t as UTCTimestamp, value: price };

        if ((chartType === "area" || granularity === 0) && areaSeriesRef.current) {
          areaSeriesRef.current.update(tickPoint);
          historyRef.current = [...historyRef.current.slice(-499), tickPoint];
        } else if (isOhlc) {
          const candleGranularity = granularity || 60;
          const barTime = Math.floor(t / candleGranularity) * candleGranularity;
          const buf = candleBufferRef.current;
          const existing = buf.get(barTime);
          const bar: Candle = existing
            ? {
                ...existing,
                high: Math.max(existing.high, price),
                low: Math.min(existing.low, price),
                close: price,
              }
            : { time: barTime, open: price, high: price, low: price, close: price };
          buf.set(barTime, bar);
          const update = {
            time: barTime as UTCTimestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          };
          if (chartType === "candle") {
            candleSeriesRef.current?.update(update);
          } else {
            barSeriesRef.current?.update(update);
          }
          candleHistoryRef.current = [
            ...candleHistoryRef.current.filter((c) => c.time !== barTime).slice(-499),
            bar,
          ];
          historyRef.current = [
            ...historyRef.current
              .filter((point) => point.time !== (barTime as UTCTimestamp))
              .slice(-499),
            { time: barTime as UTCTimestamp, value: bar.close },
          ];
        }
        pushDigit(price, digitHistoryRef, setDigitStats, showDigitStatsRef.current);
        scheduleAnalysisOverlayUpdate();
      });
    }

    init();
    return () => {
      cancelled = true;
      unsubTicks?.();
    };
  }, [
    symbol,
    granularity,
    chartType,
    onPrice,
    scheduleAnalysisOverlayUpdate,
    updateAnalysisOverlays,
  ]);

  useEffect(() => {
    updateAnalysisOverlays();
  }, [analysisTools, chartType, updateAnalysisOverlays]);

  // Barrier lines.
  useEffect(() => {
    const series = baseSeriesGetter();
    if (!series) return;
    clearBarrierLines(series, barrierLineRefs.current);
    if (highBarrier != null && lowBarrier != null) return;
    renderBarrierLines(series, barrierLineRefs.current, {
      entryPrice,
      lowerBarrier: lowBarrier,
      upperBarrier: highBarrier,
      breached: barrierBreached,
    });
  }, [entryPrice, highBarrier, lowBarrier, barrierBreached, baseSeriesGetter]);

  function toggleAnalysisTool(tool: AnalysisTool) {
    setAnalysisTools((current) => {
      const next = new Set(current);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }

  return (
    <div className={cn("min-w-0", className)}>
      {/* Toolbar */}
      <div
        className={cn("mb-2 flex min-w-0 flex-wrap items-center gap-2", compact && "mb-1 gap-1")}
      >
        {/* Timeframe buttons */}
        <div
          className={cn(
            "flex w-full min-w-0 shrink overflow-x-auto rounded-md border border-glass-border sm:w-auto sm:max-w-full",
            compact && "max-sm:hidden",
          )}
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => setGranularity(tf.value)}
              className={cn(
                "shrink-0 px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs",
                granularity === tf.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-foreground/5",
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Chart type toggle */}
        <div
          className={cn(
            "flex shrink-0 overflow-hidden rounded-md border border-glass-border",
            compact && "max-sm:hidden",
          )}
        >
          <button
            type="button"
            onClick={() => setChartType("area")}
            title="Line / Area"
            className={cn(
              "px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs",
              chartType === "area"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-foreground/5",
            )}
          >
            Area
          </button>
          <button
            type="button"
            onClick={() => {
              if (granularity === 0) setGranularity(60);
              setChartType("candle");
            }}
            title="Candlestick"
            className={cn(
              "px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs",
              chartType === "candle"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-foreground/5",
            )}
          >
            Candle
          </button>
          <button
            type="button"
            onClick={() => {
              if (granularity === 0) setGranularity(60);
              setChartType("bar");
            }}
            title="OHLC Bars"
            className={cn(
              "px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs",
              chartType === "bar"
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-foreground/5",
            )}
          >
            Bar
          </button>
        </div>

        {/* Indicators popover — Deriv-style categorized checklist. */}
        <Popover open={indicatorsOpen} onOpenChange={setIndicatorsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border border-glass-border px-2 py-1.5 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-xs",
                compact && "max-sm:hidden",
                analysisTools.size > 0
                  ? "bg-[#ff444f] text-white"
                  : "bg-transparent text-muted-foreground hover:bg-foreground/5",
              )}
              title="Indicators"
            >
              <Activity className="size-3.5" />
              <span>Indicators</span>
              {analysisTools.size > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
                  {analysisTools.size}
                </span>
              )}
              <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 max-h-[60vh] overflow-y-auto p-0">
            <div className="flex items-center justify-between border-b border-glass-border px-3 py-2">
              <span className="text-xs font-semibold">Indicators</span>
              {analysisTools.size > 0 && (
                <button
                  type="button"
                  onClick={() => setAnalysisTools(new Set())}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            {INDICATOR_CATEGORIES.map((category) => {
              const items = INDICATORS.filter((ind) => ind.category === category);
              if (!items.length) return null;
              return (
                <div key={category} className="border-b border-glass-border last:border-b-0">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </div>
                  {items.map((ind) => {
                    const active = analysisTools.has(ind.value);
                    return (
                      <button
                        key={ind.value}
                        type="button"
                        onClick={() => toggleAnalysisTool(ind.value)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-foreground/5"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                            active
                              ? "border-[#ff444f] bg-[#ff444f] text-white"
                              : "border-glass-border bg-transparent",
                          )}
                        >
                          {active && (
                            <svg viewBox="0 0 12 12" className="size-3" fill="none">
                              <path
                                d="M2 6.5l2.5 2.5L10 3.5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">{ind.label}</div>
                          <div className="text-[10px] text-muted-foreground">{ind.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Chart tools — crosshair toggle + reset zoom. */}
        <div
          className={cn(
            "flex shrink-0 overflow-hidden rounded-md border border-glass-border",
            compact && "max-sm:hidden",
          )}
        >
          <button
            type="button"
            onClick={() => setCrosshairOn((v) => !v)}
            title={crosshairOn ? "Hide crosshair" : "Show crosshair"}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-colors sm:text-xs",
              crosshairOn
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-foreground/5",
            )}
          >
            <Crosshair className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            title="Reset zoom"
            className="flex items-center gap-1 bg-transparent px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 sm:text-xs"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>

        {/* Connection status */}
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
            STATUS_STYLE[status],
          )}
        >
          ● {status}
        </span>
      </div>

      {/* Chart canvas */}
      <div className="relative w-full max-w-full overflow-hidden rounded-lg border border-glass-border bg-foreground/[0.02]">
        <div ref={containerRef} style={{ height }} className="w-full" />
        {showSymbolSelector && onSymbolChange && (
          <div
            className={cn(
              "pointer-events-none absolute left-12 right-2 top-2 z-30 sm:left-14 sm:right-auto sm:w-[320px]",
              compact && "left-10 right-1 top-1 sm:left-12",
            )}
          >
            <MarketSelector
              className="pointer-events-auto min-w-0"
              value={symbol}
              onValueChange={onSymbolChange}
            />
          </div>
        )}
        {accumulatorBand && (
          <AccumulatorBarrierBandOverlay
            band={accumulatorBand}
            breached={Boolean(barrierBreached)}
            compact={compact}
            showEntryGuide={Boolean(accumulatorProfitStatus)}
          />
        )}
        {accumulatorProfit != null &&
          accumulatorProfitStatus &&
          accumulatorProfitStatus !== "sold" && (
            <AccumulatorProfitMarker
              band={accumulatorBand}
              currency={accumulatorProfitCurrency}
              status={accumulatorProfitStatus}
              value={accumulatorProfit}
            />
          )}
        <div
          className={cn(
            "absolute left-2 top-2 z-30 flex max-h-[calc(100%-1rem)] flex-col gap-1 overflow-y-auto rounded-md border border-[#d6d9dc] bg-white/95 p-1 shadow-sm backdrop-blur dark:border-[#303030] dark:bg-[#151515]/95",
            compact && "left-1 top-1 max-h-[calc(100%-0.5rem)] gap-0.5 p-0.5",
          )}
        >
          <ChartToolButton
            active={crosshairOn}
            compact={compact}
            label={crosshairOn ? "Hide crosshair" : "Show crosshair"}
            onClick={() => setCrosshairOn((value) => !value)}
          >
            <Crosshair className={cn("size-4", compact && "size-3.5")} />
          </ChartToolButton>
          {DRAWING_TOOLS.map(({ icon: Icon, label, tool }) => (
            <ChartToolButton
              key={tool}
              active={activeDrawingTool === tool}
              compact={compact}
              label={label}
              onClick={() => setActiveDrawingTool(tool)}
            >
              <Icon className={cn("size-4", compact && "size-3.5")} />
            </ChartToolButton>
          ))}
          <ChartToolSeparator />
          <ChartToolButton compact={compact} label="Zoom in" onClick={zoomIn}>
            <CirclePlus className={cn("size-4", compact && "size-3.5")} />
          </ChartToolButton>
          <ChartToolButton
            active={magnetOn}
            compact={compact}
            label={magnetOn ? "Disable magnet" : "Enable magnet"}
            onClick={() => setMagnetOn((value) => !value)}
          >
            <Magnet className={cn("size-4", compact && "size-3.5")} />
          </ChartToolButton>
          <ChartToolButton
            active={activeDrawingTool === "pointer"}
            compact={compact}
            label="Selection mode"
            onClick={() => setActiveDrawingTool("pointer")}
          >
            <PencilLine className={cn("size-4", compact && "size-3.5")} />
          </ChartToolButton>
          <ChartToolButton
            active={drawingsLocked}
            compact={compact}
            label={drawingsLocked ? "Unlock drawings" : "Lock drawings"}
            onClick={() => setDrawingsLocked((value) => !value)}
          >
            {drawingsLocked ? (
              <LockKeyhole className={cn("size-4", compact && "size-3.5")} />
            ) : (
              <UnlockKeyhole className={cn("size-4", compact && "size-3.5")} />
            )}
          </ChartToolButton>
          <ChartToolButton
            active={!drawingsVisible}
            compact={compact}
            label={drawingsVisible ? "Hide drawings" : "Show drawings"}
            onClick={() => setDrawingsVisible((value) => !value)}
          >
            {drawingsVisible ? (
              <Eye className={cn("size-4", compact && "size-3.5")} />
            ) : (
              <EyeOff className={cn("size-4", compact && "size-3.5")} />
            )}
          </ChartToolButton>
          <ChartToolButton
            compact={compact}
            disabled={drawings.length === 0 && !draftDrawing}
            label="Delete drawings"
            onClick={() => {
              setDrawings([]);
              setDraftDrawing(null);
            }}
          >
            <Trash2 className={cn("size-4", compact && "size-3.5")} />
          </ChartToolButton>
        </div>
        <svg
          className={cn(
            "absolute inset-0 z-20 h-full w-full touch-none",
            activeDrawingTool === "pointer" || drawingsLocked
              ? "pointer-events-none"
              : "pointer-events-auto cursor-crosshair",
          )}
          onPointerDown={handleDrawingPointerDown}
          onPointerMove={handleDrawingPointerMove}
          onPointerUp={handleDrawingPointerUp}
          onPointerCancel={() => setDraftDrawing(null)}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {drawingsVisible &&
            [...drawings, ...(draftDrawing ? [draftDrawing] : [])].map((drawing) => (
              <DrawingShape
                key={drawing.id}
                drawing={drawing}
                draft={draftDrawing?.id === drawing.id}
              />
            ))}
        </svg>
        {showDigitStats && (
          <DigitStatsOverlay
            compact={compact}
            latest={digitStats.latest}
            percentages={digitStats.percentages}
          />
        )}
      </div>
    </div>
  );
}

function createDrawingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pointFromPointer(
  event: ReactPointerEvent<SVGSVGElement>,
  magnetOn: boolean,
): DrawingPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const rawX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
  const rawY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
  const x = magnetOn ? Math.round(rawX / 2) * 2 : rawX;
  const y = magnetOn ? Math.round(rawY / 2) * 2 : rawY;
  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
  };
}

function drawingDistance(a: DrawingPoint, b: DrawingPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function signedBarrierLabel(barrier: number, entry?: number | null) {
  if (entry == null || !Number.isFinite(entry)) return barrier.toFixed(4);
  const offset = barrier - entry;
  const abs = Math.abs(offset);
  const decimals = abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
  return `${offset >= 0 ? "+" : "-"}${abs.toFixed(decimals)}`;
}

function formatChartProfit(value: number, currency: string | undefined, loss: boolean) {
  const abs = Math.abs(value);
  const prefix = loss ? "-" : "+";
  return `${prefix}${abs.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function ChartToolButton({
  active,
  children,
  compact,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[3px] text-[#333333] transition hover:bg-[#edf0f2] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#eeeeee] dark:hover:bg-[#202020]",
        active && "bg-[#eef2f3] text-[#ff444f] dark:bg-[#202020] dark:text-[#ff6b73]",
        compact && "size-6",
      )}
    >
      {children}
    </button>
  );
}

function ChartToolSeparator() {
  return <span className="my-0.5 h-px w-full bg-[#e0e3e5] dark:bg-[#303030]" />;
}

function DrawingShape({ draft, drawing }: { draft?: boolean; drawing: ChartDrawing }) {
  const stroke = draft ? "#ff7a83" : "#ff444f";
  const [first, second] = drawing.points;

  if (!first) return null;

  if (drawing.tool === "horizontal" && second) {
    return (
      <line
        x1={0}
        x2={100}
        y1={first.y}
        y2={second.y}
        stroke={stroke}
        strokeDasharray="3 2"
        strokeLinecap="round"
        strokeWidth={0.45}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (drawing.tool === "trend" && second) {
    return (
      <line
        x1={first.x}
        x2={second.x}
        y1={first.y}
        y2={second.y}
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={0.55}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (drawing.tool === "measure" && second) {
    const midX = (first.x + second.x) / 2;
    const midY = (first.y + second.y) / 2;
    return (
      <g>
        <line
          x1={first.x}
          x2={second.x}
          y1={first.y}
          y2={second.y}
          stroke="#4bb4b3"
          strokeLinecap="round"
          strokeWidth={0.55}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={midX}
          y={midY}
          dominantBaseline="middle"
          fill="#111111"
          fontSize={3}
          fontWeight={700}
          paintOrder="stroke"
          stroke="white"
          strokeWidth={0.8}
          textAnchor="middle"
          vectorEffect="non-scaling-stroke"
        >
          {`${Math.abs(second.x - first.x).toFixed(1)} x ${Math.abs(second.y - first.y).toFixed(1)}`}
        </text>
      </g>
    );
  }

  if (drawing.tool === "fibonacci" && second) {
    const top = Math.min(first.y, second.y);
    const bottom = Math.max(first.y, second.y);
    const x1 = Math.min(first.x, second.x);
    const x2 = Math.max(first.x, second.x);
    const width = Math.max(8, x2 - x1);
    return (
      <g>
        <rect fill="rgba(75,180,179,0.08)" height={bottom - top} width={width} x={x1} y={top} />
        {FIBONACCI_LEVELS.map((level) => {
          const y = first.y + (second.y - first.y) * level;
          return (
            <g key={level}>
              <line
                x1={x1}
                x2={x1 + width}
                y1={y}
                y2={y}
                stroke={level === 0 || level === 1 ? "#ff444f" : "#4bb4b3"}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x1 + width + 1}
                y={y}
                dominantBaseline="middle"
                fill="#333333"
                fontSize={2.2}
                fontWeight={700}
                paintOrder="stroke"
                stroke="white"
                strokeWidth={0.7}
                vectorEffect="non-scaling-stroke"
              >
                {`${Math.round(level * 1000) / 10}%`}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (drawing.tool === "brush") {
    return (
      <polyline
        fill="none"
        points={drawing.points.map((point) => `${point.x},${point.y}`).join(" ")}
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={0.65}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (drawing.tool === "text" || drawing.tool === "emoji") {
    return (
      <text
        x={first.x}
        y={first.y}
        dominantBaseline="middle"
        fill={drawing.tool === "emoji" ? "#111111" : "#ff444f"}
        fontSize={drawing.tool === "emoji" ? 5 : 3.2}
        fontWeight={700}
        paintOrder="stroke"
        stroke="white"
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      >
        {drawing.text}
      </text>
    );
  }

  return null;
}

function AccumulatorBarrierBandOverlay({
  band,
  breached,
  compact,
  showEntryGuide,
}: {
  band: AccumulatorBarrierBand;
  breached: boolean;
  compact?: boolean;
  showEntryGuide?: boolean;
}) {
  const color = breached ? "#ff444f" : "#2196f3";
  const fill = breached ? "rgba(255,68,79,0.11)" : "rgba(33,150,243,0.12)";
  const height = Math.max(2, band.bottom - band.top);
  const width = Math.max(0, band.right - band.left);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="absolute"
        style={{
          background: fill,
          borderBottom: `2px solid ${color}`,
          borderTop: `2px solid ${color}`,
          height,
          left: band.left,
          top: band.top,
          width,
        }}
      />
      {showEntryGuide && band.entryY != null && (
        <div
          className="absolute border-t border-dashed border-[#59646d]"
          style={{
            left: band.left,
            right: 0,
            top: band.entryY,
          }}
        />
      )}
      <BarrierAxisLabel color={color} compact={compact} text={band.upperLabel} y={band.top} />
      <BarrierAxisLabel color={color} compact={compact} text={band.lowerLabel} y={band.bottom} />
    </div>
  );
}

function BarrierAxisLabel({
  color,
  compact,
  text,
  y,
}: {
  color: string;
  compact?: boolean;
  text: string;
  y: number;
}) {
  return (
    <span
      className={cn(
        "absolute right-1 rounded bg-white/90 px-1.5 py-0.5 font-mono text-xs font-bold shadow-sm dark:bg-[#151515]/90",
        compact && "right-0.5 px-1 text-[10px]",
      )}
      style={{ color, top: y, transform: "translateY(-50%)" }}
    >
      {text}
    </span>
  );
}

function AccumulatorProfitMarker({
  band,
  currency,
  status,
  value,
}: {
  band: AccumulatorBarrierBand | null;
  currency?: string;
  status: "active" | "lost" | "sold";
  value: number;
}) {
  const loss = status === "lost" || value < 0;
  const x = band ? clamp(band.left + 18, 44, Math.max(44, band.right - 112)) : 72;
  const y = band?.entryY ?? (band ? band.top - 22 : 28);

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 rounded-[3px] px-2 py-1 font-mono text-sm font-black shadow-sm",
        loss
          ? "bg-[#fff1f2] text-[#cc2f39] ring-1 ring-[#ffd1d4]"
          : "bg-[#e7f8f2] text-[#078a5b] ring-1 ring-[#b8eadb]",
      )}
      style={{ left: x, top: y, transform: "translateY(-50%)" }}
    >
      {formatChartProfit(value, currency, loss)}
    </div>
  );
}

function DigitStatsOverlay({
  compact,
  latest,
  percentages,
}: {
  compact?: boolean;
  latest: number | null;
  percentages: number[];
}) {
  const max = Math.max(...percentages);
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 right-2 z-10 overflow-x-auto rounded-md border border-[#e6e6e6] bg-white/95 px-2 py-2 shadow-sm backdrop-blur dark:border-[#303030] dark:bg-[#151515]/95",
        compact && "bottom-1 left-10 right-1 px-1 py-1",
      )}
    >
      <div className={cn("flex min-w-max items-end justify-center gap-2", compact && "gap-1")}>
        {percentages.map((pct, digit) => {
          const highlighted = pct === max && max > 0;
          const current = latest === digit;
          return (
            <div key={digit} className={cn("flex w-11 flex-col items-center", compact && "w-7")}>
              <div
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full border-2 bg-white text-sm font-bold text-[#333333] dark:bg-[#101010] dark:text-[#f2f2f2]",
                  compact && "size-5 border text-[10px]",
                  highlighted
                    ? "border-[#4bb4b3] shadow-[0_0_0_3px_#e5f7f6] dark:shadow-[0_0_0_3px_rgba(75,180,179,0.25)]"
                    : "border-[#d6d6d6] dark:border-[#444]",
                  current && "border-[#ff444f]",
                )}
              >
                {digit}
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(${highlighted ? "#4bb4b3" : "#d6d6d6"} ${Math.min(100, pct) * 3.6}deg, transparent 0deg)`,
                    mask: "radial-gradient(circle, transparent 58%, black 60%)",
                    WebkitMask: "radial-gradient(circle, transparent 58%, black 60%)",
                  }}
                />
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[10px] font-semibold text-[#646464] dark:text-[#d8d8d8]",
                  compact && "text-[8px]",
                )}
              >
                {pct.toFixed(1)}%
              </div>
              <div
                className={cn(
                  "mt-0.5 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent",
                  compact && "border-x-[3px] border-t-[4px]",
                  current
                    ? highlighted
                      ? "border-t-[#4bb4b3]"
                      : "border-t-[#ff444f]"
                    : "border-t-transparent",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function updateDigitStatsFromPrices(
  prices: number[],
  ref: MutableRefObject<number[]>,
  setStats: Dispatch<SetStateAction<{ latest: number | null; percentages: number[] }>>,
  publish = true,
) {
  const digits = digitsFromPrices(prices, 500);
  ref.current = digits;
  if (publish) setStats(calculateDigitStats(digits));
}

function pushDigit(
  price: number,
  ref: MutableRefObject<number[]>,
  setStats: Dispatch<SetStateAction<{ latest: number | null; percentages: number[] }>>,
  publish = true,
) {
  const digit = lastDigitFromPrice(price);
  if (digit == null) return;
  ref.current.push(digit);
  if (ref.current.length > 500) ref.current.splice(0, ref.current.length - 500);
  if (publish) setStats(calculateDigitStats(ref.current));
}

function movingAverage(data: LineData[], period: number): LineData[] {
  return data.map((point, index) => {
    const window = data.slice(Math.max(0, index - period + 1), index + 1);
    const value = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    return { time: point.time, value };
  });
}

function exponentialAverage(data: LineData[], period: number): LineData[] {
  const k = 2 / (period + 1);
  let previous = data[0]?.value ?? 0;
  return data.map((point, index) => {
    const value = index === 0 ? point.value : point.value * k + previous * (1 - k);
    previous = value;
    return { time: point.time, value };
  });
}

function bollingerBands(data: LineData[], period: number): [LineData[], LineData[]] {
  const upper: LineData[] = [];
  const lower: LineData[] = [];
  data.forEach((point, index) => {
    const window = data.slice(Math.max(0, index - period + 1), index + 1);
    const mean = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    const variance =
      window.reduce((sum, item) => sum + Math.pow(item.value - mean, 2), 0) / window.length;
    const deviation = Math.sqrt(variance);
    upper.push({ time: point.time, value: mean + deviation * 2 });
    lower.push({ time: point.time, value: mean - deviation * 2 });
  });
  return [upper, lower];
}

// Wilder's RSI — standard 14-period formulation used across charting tools.
function relativeStrengthIndex(data: LineData[], period: number): LineData[] {
  if (data.length === 0) return [];
  const result: LineData[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (i === 0) {
      result.push({ time: data[i].time, value: 50 });
      continue;
    }
    const change = data[i].value - data[i - 1].value;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= period) {
      avgGain = (avgGain * (i - 1) + gain) / i;
      avgLoss = (avgLoss * (i - 1) + loss) / i;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    result.push({ time: data[i].time, value: rsi });
  }
  return result;
}

function emaArray(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function macdSeries(
  data: LineData[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): { macd: LineData[]; signal: LineData[] } {
  const values = data.map((p) => p.value);
  const fast = emaArray(values, fastPeriod);
  const slow = emaArray(values, slowPeriod);
  const macdValues = fast.map((value, i) => value - slow[i]);
  const signalValues = emaArray(macdValues, signalPeriod);
  return {
    macd: data.map((point, i) => ({ time: point.time, value: macdValues[i] })),
    signal: data.map((point, i) => ({ time: point.time, value: signalValues[i] })),
  };
}

function stochasticSeries(
  data: LineData[],
  kPeriod: number,
  dPeriod: number,
): { k: LineData[]; d: LineData[] } {
  const kValues: number[] = [];
  data.forEach((_, i) => {
    const window = data.slice(Math.max(0, i - kPeriod + 1), i + 1);
    const highs = window.map((p) => p.value);
    const high = Math.max(...highs);
    const low = Math.min(...highs);
    const range = high - low;
    const value = range === 0 ? 50 : ((data[i].value - low) / range) * 100;
    kValues.push(value);
  });
  const dValues = kValues.map((_, i) => {
    const window = kValues.slice(Math.max(0, i - dPeriod + 1), i + 1);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
  return {
    k: data.map((point, i) => ({ time: point.time, value: kValues[i] })),
    d: data.map((point, i) => ({ time: point.time, value: dValues[i] })),
  };
}

function weightedAverage(data: LineData[], period: number): LineData[] {
  return data.map((point, index) => {
    const window = data.slice(Math.max(0, index - period + 1), index + 1);
    let weightedSum = 0;
    let weightTotal = 0;
    window.forEach((item, i) => {
      const weight = i + 1;
      weightedSum += item.value * weight;
      weightTotal += weight;
    });
    return { time: point.time, value: weightedSum / weightTotal };
  });
}

function donchianChannel(
  candles: Candle[],
  period: number,
): { upper: LineData[]; lower: LineData[] } {
  const upper: LineData[] = [];
  const lower: LineData[] = [];
  candles.forEach((candle, i) => {
    const window = candles.slice(Math.max(0, i - period + 1), i + 1);
    upper.push({
      time: candle.time as UTCTimestamp,
      value: Math.max(...window.map((c) => c.high)),
    });
    lower.push({
      time: candle.time as UTCTimestamp,
      value: Math.min(...window.map((c) => c.low)),
    });
  });
  return { upper, lower };
}

function parabolicSar(candles: Candle[], step: number, maxStep: number): LineData[] {
  if (candles.length < 2) {
    return candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.low }));
  }
  const result: LineData[] = [];
  let isUp = candles[1].close > candles[0].close;
  let sar = isUp ? candles[0].low : candles[0].high;
  let ep = isUp ? candles[0].high : candles[0].low;
  let af = step;
  result.push({ time: candles[0].time as UTCTimestamp, value: sar });
  for (let i = 1; i < candles.length; i += 1) {
    const candle = candles[i];
    sar = sar + af * (ep - sar);
    if (isUp) {
      sar = Math.min(sar, candles[i - 1].low);
      if (i >= 2) sar = Math.min(sar, candles[i - 2].low);
      if (candle.low < sar) {
        isUp = false;
        sar = ep;
        ep = candle.low;
        af = step;
      } else if (candle.high > ep) {
        ep = candle.high;
        af = Math.min(maxStep, af + step);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high);
      if (i >= 2) sar = Math.max(sar, candles[i - 2].high);
      if (candle.high > sar) {
        isUp = true;
        sar = ep;
        ep = candle.high;
        af = step;
      } else if (candle.low < ep) {
        ep = candle.low;
        af = Math.min(maxStep, af + step);
      }
    }
    result.push({ time: candle.time as UTCTimestamp, value: sar });
  }
  return result;
}

function commodityChannelIndex(candles: Candle[], period: number): LineData[] {
  return candles.map((candle, i) => {
    const window = candles.slice(Math.max(0, i - period + 1), i + 1);
    const typical = window.map((c) => (c.high + c.low + c.close) / 3);
    const mean = typical.reduce((sum, v) => sum + v, 0) / typical.length;
    const meanDeviation = typical.reduce((sum, v) => sum + Math.abs(v - mean), 0) / typical.length;
    const currentTp = (candle.high + candle.low + candle.close) / 3;
    const value = meanDeviation === 0 ? 0 : (currentTp - mean) / (0.015 * meanDeviation);
    return { time: candle.time as UTCTimestamp, value };
  });
}

function williamsR(candles: Candle[], period: number): LineData[] {
  return candles.map((candle, i) => {
    const window = candles.slice(Math.max(0, i - period + 1), i + 1);
    const highest = Math.max(...window.map((c) => c.high));
    const lowest = Math.min(...window.map((c) => c.low));
    const range = highest - lowest;
    const value = range === 0 ? -50 : ((highest - candle.close) / range) * -100;
    return { time: candle.time as UTCTimestamp, value };
  });
}

function awesomeOscillator(candles: Candle[], fastPeriod: number, slowPeriod: number): LineData[] {
  const medians = candles.map((c) => (c.high + c.low) / 2);
  const fast = medians.map((_, i) => {
    const window = medians.slice(Math.max(0, i - fastPeriod + 1), i + 1);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
  const slow = medians.map((_, i) => {
    const window = medians.slice(Math.max(0, i - slowPeriod + 1), i + 1);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });
  return candles.map((candle, i) => ({
    time: candle.time as UTCTimestamp,
    value: fast[i] - slow[i],
  }));
}

function averageTrueRange(candles: Candle[], period: number): LineData[] {
  if (candles.length === 0) return [];
  const trs: number[] = [];
  candles.forEach((candle, i) => {
    if (i === 0) {
      trs.push(candle.high - candle.low);
      return;
    }
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose),
      ),
    );
  });
  const result: LineData[] = [];
  let atr = trs[0];
  for (let i = 0; i < candles.length; i += 1) {
    if (i === 0) {
      result.push({ time: candles[i].time as UTCTimestamp, value: atr });
      continue;
    }
    if (i < period) {
      atr = (atr * i + trs[i]) / (i + 1);
    } else {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    result.push({ time: candles[i].time as UTCTimestamp, value: atr });
  }
  return result;
}
