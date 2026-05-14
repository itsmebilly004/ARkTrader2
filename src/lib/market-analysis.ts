import { fetchTicks, SYNTHETIC_MARKETS } from "@/lib/deriv";
import { BOT_PRESET_CONFIGS, type BotPresetConfig } from "@/lib/bot-presets";
import { calculateDigitStats, digitsFromPrices } from "@/lib/digit-stats";

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
  market: string;
  marketLabel: string;
  name: string;
  presetId: string;
  tradeType: string;
};

export async function analyzeDigitsForSymbol(symbol: string) {
  const ticks = await fetchTicks(symbol, 500);
  const digits = digitsFromPrices(
    ticks.map((tick) => tick.value),
    500,
  );
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
  } satisfies DigitMarketAnalysis;
}

export async function analyzeBestBotOpportunities() {
  const markets = Array.from(new Set(BOT_PRESET_CONFIGS.map((preset) => preset.market)));
  const analyses = await Promise.all(
    markets.map(async (market) => [market, await analyzeDigitsForSymbol(market)] as const),
  );
  const marketMap = new Map(analyses);
  return BOT_PRESET_CONFIGS.map((preset) => {
    const analysis = marketMap.get(preset.market);
    if (!analysis) return null;
    const actualProbability = presetProbability(preset, analysis.counts, analysis.sampleSize);
    const expectedProbability = expectedPresetProbability(preset);
    return {
      actualProbability,
      contractType: preset.contractType,
      edge: actualProbability - expectedProbability,
      expectedProbability,
      market: preset.market,
      marketLabel: analysis.marketLabel,
      name: preset.name,
      presetId: preset.id,
      tradeType: preset.tradeType,
    } satisfies BotOpportunity;
  })
    .filter((item): item is BotOpportunity => Boolean(item))
    .sort((left, right) => {
      if (right.edge !== left.edge) return right.edge - left.edge;
      return right.actualProbability - left.actualProbability;
    });
}

function bestOverUnderRecommendation(counts: number[], total: number): OverUnderRecommendation {
  const safeTotal = Math.max(total, 1);
  const candidates: OverUnderRecommendation[] = [];
  for (let threshold = 1; threshold <= 8; threshold += 1) {
    const underCount = counts.slice(0, threshold).reduce((sum, count) => sum + count, 0);
    const overCount = counts.slice(threshold + 1).reduce((sum, count) => sum + count, 0);
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
  return candidates.sort((left, right) => {
    const leftEdge = left.probability - left.expected;
    const rightEdge = right.probability - right.expected;
    if (rightEdge !== leftEdge) return rightEdge - leftEdge;
    return right.probability - left.probability;
  })[0];
}

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
    const wins =
      preset.contractType === "matches" ? digitCount : safeTotal - digitCount;
    return (wins / safeTotal) * 100;
  }
  if (preset.contractType === "under") {
    const wins = counts.slice(0, preset.predictionDigit).reduce((sum, count) => sum + count, 0);
    return (wins / safeTotal) * 100;
  }
  const wins = counts
    .slice(Math.min(9, preset.predictionDigit + 1))
    .reduce((sum, count) => sum + count, 0);
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

function marketLabelForSymbol(symbol: string) {
  return SYNTHETIC_MARKETS.find((market) => market.symbol === symbol)?.name ?? symbol;
}

function sumPercentages(percentages: number[], digits: number[]) {
  return digits.reduce((sum, digit) => sum + (percentages[digit] ?? 0), 0);
}
