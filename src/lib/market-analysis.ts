import { fetchTicks, SYNTHETIC_MARKETS, type TickPoint, getPipSize } from "@/lib/deriv";
import { BOT_PRESET_CONFIGS, type BotPresetConfig } from "@/lib/bot-presets";
import { TRADING_BOT_ASSETS } from "@/lib/trading-bot-database";
import { calculateDigitStats, digitsFromPrices } from "@/lib/digit-stats";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ManualContractKind =
  | "even_odd"
  | "matches_differs"
  | "over_under"
  | "rise_fall"
  | "accumulator";

type OverUnderRecommendation = {
  expected: number;
  probability: number;
  side: "over" | "under";
  threshold: number;
};

export type DigitMarketAnalysis = {
  counts: number[];
  evenPercentage: number;
  hottestDigits: number[];
  latestDigit: number | null;
  marketLabel: string;
  oddPercentage: number;
  overUnder: OverUnderRecommendation;
  percentages: number[];
  sampleSize: number;
  symbol: string;
};

export type BotOpportunity = {
  actualProbability: number;
  contractType: string;
  edge: number;
  expectedProbability: number;
  launchable: boolean;
  market: string;
  marketLabel: string;
  name: string;
  presetId: string;
  presetMartingale: number;
  presetMartingaleMode: "additive" | "multiplicative";
  presetStake: number;
  tradeType: string;
};

export type ManualMarketSuggestion = {
  digitPercentages?: number[];
  edge: number;
  expectation: number;
  hitRate: number;
  marketLabel: string;
  side: string;
  symbol: string;
};

export type StakeRecommendation = {
  martingale: number;
  maxLoss: number;
  rationale: string;
  riskBand: "aggressive" | "balanced" | "conservative";
  stake: number;
  streakLength: number;
};

export type ManualStakeRecommendation = {
  rationale: string;
  riskBand: "aggressive" | "balanced" | "conservative";
  stake: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DIGIT_MARKET_SYMBOLS = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V",
] as const;

const TICK_COUNT = 500;
const CACHE_TTL_MS = 2000;
const MIN_ANALYSIS_DURATION_MS = 10_000;

export type AnalysisProgress = { pct: number; stage: string };

export type AnalysisOptions = {
  forceRefresh?: boolean;
  minDurationMs?: number;
  onProgress?: (progress: AnalysisProgress) => void;
};

function binomialZScore(observedPct: number, expectedPct: number, sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  const p = expectedPct / 100;
  const variance = (p * (1 - p)) / sampleSize;
  if (variance <= 0) return 0;
  const stdErrPct = Math.sqrt(variance) * 100;
  return (observedPct - expectedPct) / stdErrPct;
}

async function pace(startedAt: number, targetElapsedMs: number): Promise<void> {
  const remaining = targetElapsedMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
}

// ─── In-flight cache (2s TTL, dedupe only) ───────────────────────────────────

type CacheEntry = { fetchedAt: number; ticks: TickPoint[] };
const ticksCache = new Map<string, CacheEntry>();

function getCachedTicks(symbol: string): TickPoint[] | null {
  const entry = ticksCache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    ticksCache.delete(symbol);
    return null;
  }
  return entry.ticks;
}

function setCachedTicks(symbol: string, ticks: TickPoint[]): void {
  ticksCache.set(symbol, { fetchedAt: Date.now(), ticks });
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchTicksSingle(symbol: string, count: number): Promise<TickPoint[]> {
  const cached = getCachedTicks(symbol);
  if (cached) return cached;
  const ticks = await fetchTicks(symbol, count);
  setCachedTicks(symbol, ticks);
  return ticks;
}

export async function fetchTicksBatch(
  symbols: readonly string[],
  count: number,
): Promise<Map<string, TickPoint[] | null>> {
  const result = new Map<string, TickPoint[] | null>();
  const toFetch: string[] = [];

  for (const symbol of symbols) {
    const cached = getCachedTicks(symbol);
    if (cached) result.set(symbol, cached);
    else toFetch.push(symbol);
  }

  if (toFetch.length > 0) {
    await Promise.all(
      toFetch.map(async (symbol) => {
        try {
          const ticks = await fetchTicks(symbol, count);
          setCachedTicks(symbol, ticks);
          result.set(symbol, ticks);
        } catch {
          result.set(symbol, null);
        }
      }),
    );
  }

  return result;
}

// ─── Digit analysis helpers ──────────────────────────────────────────────────

function buildDigitAnalysis(symbol: string, ticks: TickPoint[]): {
  counts: number[];
  percentages: number[];
  sampleSize: number;
} {
  const digits = digitsFromPrices(ticks.map((t) => t.value), getPipSize(symbol), ticks.length);
  const stats = calculateDigitStats(digits);
  return { counts: stats.counts, percentages: stats.percentages, sampleSize: digits.length };
}

function riseFallSuggestionFromTicks(symbol: string, ticks: TickPoint[]): ManualMarketSuggestion {
  const marketLabel = marketLabelForSymbol(symbol);
  let upMoves = 0;
  let downMoves = 0;
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1].value;
    const curr = ticks[i].value;
    if (curr > prev) upMoves++;
    else if (curr < prev) downMoves++;
  }
  const total = upMoves + downMoves;
  const upRate = total > 0 ? (upMoves / total) * 100 : 50;
  const downRate = total > 0 ? (downMoves / total) * 100 : 50;
  const side = upRate >= downRate ? "Rise" : "Fall";
  const hitRate = Math.max(upRate, downRate);
  return { symbol, marketLabel, side, hitRate, expectation: 50, edge: hitRate - 50 };
}

// ─── Accumulator analysis ──────────────────────────────────────────────────────
//
// Accumulators reward calm markets: the contract keeps growing while the spot
// stays inside a tight barrier band and busts the moment a tick jumps outside
// it. The "best" accumulator market is therefore the one with the lowest
// tick-to-tick volatility — we rank by mean absolute return and translate the
// calmest market into the highest stability score.

function accumulatorSuggestionsFromTicks(
  ticksMap: Map<string, TickPoint[] | null>,
): Array<ManualMarketSuggestion & { confidence: number }> {
  const rows: Array<{ symbol: string; meanReturn: number }> = [];
  for (const symbol of DIGIT_MARKET_SYMBOLS) {
    const ticks = ticksMap.get(symbol);
    if (!ticks || ticks.length < 10) continue;
    let sum = 0;
    let n = 0;
    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1].value;
      const curr = ticks[i].value;
      if (prev > 0) {
        sum += Math.abs(curr - prev) / prev;
        n += 1;
      }
    }
    rows.push({ symbol, meanReturn: n > 0 ? sum / n : Infinity });
  }

  const finite = rows.filter((r) => Number.isFinite(r.meanReturn));
  if (finite.length === 0) return [];
  const minR = Math.min(...finite.map((r) => r.meanReturn));
  const maxR = Math.max(...finite.map((r) => r.meanReturn));

  return rows.map(({ symbol, meanReturn }) => {
    const stability =
      maxR > minR && Number.isFinite(meanReturn)
        ? 50 + (50 * (maxR - meanReturn)) / (maxR - minR)
        : 50;
    return {
      confidence: stability,
      edge: stability - 50,
      expectation: 50,
      hitRate: stability,
      marketLabel: marketLabelForSymbol(symbol),
      side: "Buy",
      symbol,
    };
  });
}

// ─── Martingale mode heuristic ────────────────────────────────────────────────

function martingaleModeForPreset(preset: BotPresetConfig): "additive" | "multiplicative" {
  if (preset.id === "candle-mine") return "additive";
  if (preset.tradeType === "matches_differs" && preset.martingale >= 3) return "additive";
  return "multiplicative";
}

// ─── Probability calculators ─────────────────────────────────────────────────

function presetProbability(preset: BotPresetConfig, counts: number[], total: number) {
  const safeTotal = Math.max(total, 1);
  if (preset.tradeType === "even_odd") {
    const odd = counts[1] + counts[3] + counts[5] + counts[7] + counts[9];
    const even = counts[0] + counts[2] + counts[4] + counts[6] + counts[8];
    const wins = preset.contractType === "odd" ? odd : even;
    return (wins / safeTotal) * 100;
  }
  if (preset.tradeType === "matches_differs") {
    const digitCount = counts[preset.predictionDigit] ?? 0;
    const wins = preset.contractType === "matches" ? digitCount : safeTotal - digitCount;
    return (wins / safeTotal) * 100;
  }
  if (preset.contractType === "under") {
    const wins = counts.slice(0, preset.predictionDigit).reduce((s, c) => s + c, 0);
    return (wins / safeTotal) * 100;
  }
  const wins = counts
    .slice(Math.min(9, preset.predictionDigit + 1))
    .reduce((s, c) => s + c, 0);
  return (wins / safeTotal) * 100;
}

function expectedPresetProbability(preset: BotPresetConfig) {
  if (preset.tradeType === "even_odd") return 50;
  if (preset.tradeType === "matches_differs") {
    return preset.contractType === "matches" ? 10 : 90;
  }
  if (preset.contractType === "under") return preset.predictionDigit * 10;
  return ((9 - preset.predictionDigit) / 10) * 100;
}

// ─── Bot opportunity analysis ────────────────────────────────────────────────

export async function analyzeBestBotOpportunities(
  options: AnalysisOptions = {},
): Promise<BotOpportunity[]> {
  const { forceRefresh = false, minDurationMs = MIN_ANALYSIS_DURATION_MS, onProgress } = options;
  const startedAt = Date.now();
  if (forceRefresh) ticksCache.clear();

  const launchableIds = new Set(TRADING_BOT_ASSETS.map((a) => a.id));
  const markets = Array.from(new Set(BOT_PRESET_CONFIGS.map((p) => p.market)));

  onProgress?.({ pct: 0.05, stage: `Fetching ${TICK_COUNT} fresh ticks across ${markets.length} markets…` });
  const ticksMap = await fetchTicksBatch(markets, TICK_COUNT);
  await pace(startedAt, minDurationMs * 0.2);

  let allFailed = true;
  for (const ticks of ticksMap.values()) {
    if (ticks && ticks.length > 0) { allFailed = false; break; }
  }
  if (allFailed) throw new Error("Could not reach Deriv's market data — check your connection");

  onProgress?.({ pct: 0.3, stage: "Decoding last-digit distributions per market…" });
  const digitDataPerMarket = new Map<string, { counts: number[]; sampleSize: number }>();
  for (const [symbol, ticks] of ticksMap) {
    if (!ticks || ticks.length < 10) continue;
    const { counts, sampleSize } = buildDigitAnalysis(symbol, ticks);
    digitDataPerMarket.set(symbol, { counts, sampleSize });
  }
  await pace(startedAt, minDurationMs * 0.4);

  onProgress?.({ pct: 0.5, stage: "Computing fair-value baselines for each bot preset…" });
  await pace(startedAt, minDurationMs * 0.6);

  onProgress?.({ pct: 0.7, stage: "Scoring statistical confidence (z-score) per preset…" });
  const results: Array<BotOpportunity & { confidence: number }> = [];
  for (const preset of BOT_PRESET_CONFIGS) {
    const digit = digitDataPerMarket.get(preset.market);
    if (!digit) continue;
    try {
      const { counts, sampleSize } = digit;
      const actualProbability = presetProbability(preset, counts, sampleSize);
      const expectedProbability = expectedPresetProbability(preset);
      results.push({
        actualProbability,
        confidence: binomialZScore(actualProbability, expectedProbability, sampleSize),
        contractType: preset.contractType,
        edge: actualProbability - expectedProbability,
        expectedProbability,
        launchable: launchableIds.has(preset.id),
        market: preset.market,
        marketLabel: marketLabelForSymbol(preset.market),
        name: preset.name,
        presetId: preset.id,
        presetMartingale: preset.martingale,
        presetMartingaleMode: martingaleModeForPreset(preset),
        presetStake: preset.stake,
        tradeType: preset.tradeType,
      });
    } catch {
      // per-preset failure is non-fatal
    }
  }
  await pace(startedAt, minDurationMs * 0.85);

  onProgress?.({ pct: 0.95, stage: "Ranking presets by confidence-weighted edge…" });
  const ranked = results
    .sort((a, b) => {
      if (a.launchable !== b.launchable) return a.launchable ? -1 : 1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.edge - a.edge;
    })
    .map(({ confidence: _confidence, ...rest }) => rest);
  await pace(startedAt, minDurationMs);

  onProgress?.({ pct: 1, stage: "Analysis complete." });
  return ranked;
}

// ─── Manual market analysis ──────────────────────────────────────────────────

export async function analyzeBestMarketForContract(
  kind: ManualContractKind,
  options: AnalysisOptions = {},
): Promise<ManualMarketSuggestion[]> {
  const { forceRefresh = false, minDurationMs = MIN_ANALYSIS_DURATION_MS, onProgress } = options;
  const startedAt = Date.now();
  if (forceRefresh) ticksCache.clear();

  onProgress?.({
    pct: 0.05,
    stage: `Fetching ${TICK_COUNT} fresh ticks across ${DIGIT_MARKET_SYMBOLS.length} synthetic markets…`,
  });
  const ticksMap = await fetchTicksBatch(DIGIT_MARKET_SYMBOLS, TICK_COUNT);
  await pace(startedAt, minDurationMs * 0.2);

  onProgress?.({ pct: 0.3, stage: "Decoding digit distributions per market…" });
  await pace(startedAt, minDurationMs * 0.4);

  onProgress?.({ pct: 0.55, stage: `Searching best threshold/digit per market for ${kind.replace("_", "/")}…` });

  const suggestions: Array<ManualMarketSuggestion & { confidence: number }> = [];
  let allFailed = true;

  if (kind === "accumulator") {
    const accs = accumulatorSuggestionsFromTicks(ticksMap);
    if (accs.length > 0) {
      allFailed = false;
      suggestions.push(...accs);
    }
  } else
  for (const symbol of DIGIT_MARKET_SYMBOLS) {
    const ticks = ticksMap.get(symbol);
    if (!ticks || ticks.length < 10) continue;
    allFailed = false;

    try {
      if (kind === "rise_fall") {
        const suggestion = riseFallSuggestionFromTicks(symbol, ticks);
        suggestions.push({
          ...suggestion,
          confidence: binomialZScore(suggestion.hitRate, 50, ticks.length - 1),
        });
        continue;
      }

      const marketLabel = marketLabelForSymbol(symbol);
      const { counts, percentages, sampleSize } = buildDigitAnalysis(symbol, ticks);
      const safeTotal = Math.max(sampleSize, 1);

      if (kind === "even_odd") {
        const evenRate = [0, 2, 4, 6, 8].reduce((s, d) => s + percentages[d], 0);
        const oddRate = [1, 3, 5, 7, 9].reduce((s, d) => s + percentages[d], 0);
        const side = evenRate >= oddRate ? "Even" : "Odd";
        const hitRate = Math.max(evenRate, oddRate);
        suggestions.push({
          confidence: binomialZScore(hitRate, 50, sampleSize),
          digitPercentages: percentages,
          edge: hitRate - 50,
          expectation: 50,
          hitRate,
          marketLabel,
          side,
          symbol,
        });
      } else if (kind === "over_under") {
        let bestZ = -Infinity;
        let bestEdge = 0;
        let bestSide = "Over 4";
        let bestHitRate = 50;
        let bestExpectation = 50;

        for (let t = 1; t <= 8; t++) {
          const underCount = counts.slice(0, t).reduce((s, c) => s + c, 0);
          const overCount = counts.slice(t + 1).reduce((s, c) => s + c, 0);
          const underRate = (underCount / safeTotal) * 100;
          const overRate = (overCount / safeTotal) * 100;
          const underExpected = t * 10;
          const overExpected = ((9 - t) / 10) * 100;

          const underZ = binomialZScore(underRate, underExpected, sampleSize);
          if (underZ > bestZ) {
            bestZ = underZ;
            bestEdge = underRate - underExpected;
            bestSide = `Under ${t}`;
            bestHitRate = underRate;
            bestExpectation = underExpected;
          }
          const overZ = binomialZScore(overRate, overExpected, sampleSize);
          if (overZ > bestZ) {
            bestZ = overZ;
            bestEdge = overRate - overExpected;
            bestSide = `Over ${t}`;
            bestHitRate = overRate;
            bestExpectation = overExpected;
          }
        }
        suggestions.push({
          confidence: bestZ,
          digitPercentages: percentages,
          edge: bestEdge,
          expectation: bestExpectation,
          hitRate: bestHitRate,
          marketLabel,
          side: bestSide,
          symbol,
        });
      } else if (kind === "matches_differs") {
        let bestZ = -Infinity;
        let bestEdge = 0;
        let bestSide = "Differs 5";
        let bestHitRate = 90;
        let bestExpectation = 90;

        for (let d = 0; d <= 9; d++) {
          const matchCount = counts[d] ?? 0;
          const differCount = safeTotal - matchCount;
          const matchRate = (matchCount / safeTotal) * 100;
          const differRate = (differCount / safeTotal) * 100;

          const matchZ = binomialZScore(matchRate, 10, sampleSize);
          if (matchZ > bestZ) {
            bestZ = matchZ;
            bestEdge = matchRate - 10;
            bestSide = `Matches ${d}`;
            bestHitRate = matchRate;
            bestExpectation = 10;
          }
          const differZ = binomialZScore(differRate, 90, sampleSize);
          if (differZ > bestZ) {
            bestZ = differZ;
            bestEdge = differRate - 90;
            bestSide = `Differs ${d}`;
            bestHitRate = differRate;
            bestExpectation = 90;
          }
        }
        suggestions.push({
          confidence: bestZ,
          digitPercentages: percentages,
          edge: bestEdge,
          expectation: bestExpectation,
          hitRate: bestHitRate,
          marketLabel,
          side: bestSide,
          symbol,
        });
      }
    } catch {
      // per-symbol failure is non-fatal
    }
  }

  if (allFailed) throw new Error("Could not reach Deriv's market data — check your connection");

  await pace(startedAt, minDurationMs * 0.75);
  onProgress?.({ pct: 0.85, stage: "Scoring statistical confidence (z-score) across candidates…" });
  await pace(startedAt, minDurationMs * 0.9);

  onProgress?.({ pct: 0.95, stage: `Selecting the strongest signal for ${kind.replace("_", "/")}…` });
  const ranked = suggestions
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.edge - a.edge;
    })
    .map(({ confidence: _confidence, ...rest }) => rest);
  await pace(startedAt, minDurationMs);

  onProgress?.({ pct: 1, stage: "Analysis complete." });
  return ranked;
}

// ─── Stake recommenders ───────────────────────────────────────────────────────

function riskBandFromBalance(balance: number): "aggressive" | "balanced" | "conservative" {
  if (balance < 50) return "conservative";
  if (balance < 500) return "balanced";
  return "aggressive";
}

export function recommendStakeAndMartingale({
  balance,
  presetMartingale,
  presetMartingaleMode,
  riskBand: providedBand,
}: {
  balance: number;
  presetMartingale: number;
  presetMartingaleMode: "additive" | "multiplicative";
  presetStake: number;
  riskBand?: "aggressive" | "balanced" | "conservative";
}): StakeRecommendation {
  const riskBand = providedBand ?? riskBandFromBalance(balance);
  const riskPct = riskBand === "conservative" ? 0.10 : riskBand === "balanced" ? 0.20 : 0.35;
  const streakLength = riskBand === "conservative" ? 5 : riskBand === "balanced" ? 7 : 9;
  const riskBudget = Math.max(balance * riskPct, 0.35);

  // Clamp multiplicative martingale for conservative/balanced
  let recommendedMartingale = presetMartingale;
  if (presetMartingaleMode === "multiplicative") {
    const maxM = riskBand === "conservative" ? 2.0 : riskBand === "balanced" ? 2.5 : presetMartingale;
    recommendedMartingale = Math.min(presetMartingale, maxM);
  }

  let stake: number;
  let maxLoss: number;
  let N = streakLength;

  if (presetMartingaleMode === "additive") {
    const addAmount = presetMartingale;
    N = Math.min(streakLength, 3);
    const candidate = (riskBudget - addAmount * N * (N - 1) / 2) / N;
    stake = Math.max(0.35, candidate);
    maxLoss = N * stake + addAmount * N * (N - 1) / 2;
  } else {
    const m = Math.max(1.01, recommendedMartingale);
    const geomSum = (Math.pow(m, N + 1) - 1) / (m - 1);
    stake = riskBudget / geomSum;
    stake = Math.max(0.35, Math.min(balance * 0.05, stake));
    maxLoss = stake * geomSum;
  }

  stake = Math.round(stake * 100) / 100;
  stake = Math.max(0.35, stake);
  maxLoss = Math.round(maxLoss * 100) / 100;

  const pctLabel = `${(riskPct * 100).toFixed(0)}%`;
  const rationale = `${capitalize(riskBand)} risk: ${pctLabel} of balance at risk over ${N}-loss streak.`;

  return { martingale: recommendedMartingale, maxLoss, rationale, riskBand, stake, streakLength: N };
}

export function recommendManualStake({
  balance,
  edge,
}: {
  balance: number;
  edge?: number;
}): ManualStakeRecommendation {
  const riskBand = riskBandFromBalance(balance);
  const pct = riskBand === "conservative" ? 0.01 : riskBand === "balanced" ? 0.02 : 0.03;
  const stake = Math.max(0.35, Math.round(balance * pct * 100) / 100);
  const hasEdge = edge !== undefined && edge > 2;
  const rationale = hasEdge
    ? `Detected +${edge.toFixed(1)}% edge — ${(pct * 100).toFixed(0)}% flat stake keeps risk bounded.`
    : `No strong edge — ${(pct * 100).toFixed(0)}% flat stake for disciplined single-trade sizing.`;
  return { rationale, riskBand, stake };
}

// ─── Legacy export (used by the old even-odd / over-under tabs) ───────────────

export async function analyzeDigitsForSymbol(symbol: string): Promise<DigitMarketAnalysis> {
  const ticks = await fetchTicksSingle(symbol, 500);
  const digits = digitsFromPrices(ticks.map((t) => t.value), getPipSize(symbol), 500);
  const stats = calculateDigitStats(digits);
  const counts = stats.counts;
  const sampleSize = digits.length;
  const evenPercentage = sumPercentages(stats.percentages, [0, 2, 4, 6, 8]);
  const oddPercentage = sumPercentages(stats.percentages, [1, 3, 5, 7, 9]);
  const hottestValue = Math.max(...counts);
  const hottestDigits = counts
    .map((count, digit) => ({ count, digit }))
    .filter((item) => item.count === hottestValue && item.count > 0)
    .map((item) => item.digit);
  return {
    counts,
    evenPercentage,
    hottestDigits,
    latestDigit: stats.latest,
    marketLabel: marketLabelForSymbol(symbol),
    oddPercentage,
    overUnder: bestOverUnderRecommendation(counts, sampleSize),
    percentages: stats.percentages,
    sampleSize,
    symbol,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function bestOverUnderRecommendation(counts: number[], total: number): OverUnderRecommendation {
  const safeTotal = Math.max(total, 1);
  const candidates: OverUnderRecommendation[] = [];
  for (let threshold = 1; threshold <= 8; threshold += 1) {
    const underCount = counts.slice(0, threshold).reduce((s, c) => s + c, 0);
    const overCount = counts.slice(threshold + 1).reduce((s, c) => s + c, 0);
    candidates.push({
      expected: threshold * 10,
      probability: (underCount / safeTotal) * 100,
      side: "under",
      threshold,
    });
    candidates.push({
      expected: ((9 - threshold) / 10) * 100,
      probability: (overCount / safeTotal) * 100,
      side: "over",
      threshold,
    });
  }
  return candidates.sort((a, b) => {
    const aEdge = a.probability - a.expected;
    const bEdge = b.probability - b.expected;
    if (bEdge !== aEdge) return bEdge - aEdge;
    return b.probability - a.probability;
  })[0];
}

function marketLabelForSymbol(symbol: string) {
  return SYNTHETIC_MARKETS.find((m) => m.symbol === symbol)?.name ?? symbol;
}

function sumPercentages(percentages: number[], digits: number[]) {
  return digits.reduce((s, d) => s + (percentages[d] ?? 0), 0);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
