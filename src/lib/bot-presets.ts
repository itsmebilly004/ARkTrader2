export type BotPresetConfig = {
  contractType: string;
  desc: string;
  duration: number;
  durationUnit: "m" | "s" | "t";
  iconKey: "brain" | "cpu" | "flame" | "radar" | "shield" | "target" | "zap";
  id: string;
  market: string;
  martingale: number;
  maxRuns: number;
  name: string;
  predictionDigit: number;
  sl: number;
  stake: number;
  tp: number;
  tradeType: "even_odd" | "matches_differs" | "over_under";
};

export const BOT_PRESET_CONFIGS: BotPresetConfig[] = [
  {
    id: "nova-v6",
    name: "ArkTraders Nova UnderPulse",
    iconKey: "cpu",
    desc: "Adaptive Under bot from the Nova Harvester asset. Built for fast 1-second index sessions with controlled recovery.",
    market: "1HZ100V",
    tradeType: "over_under",
    contractType: "under",
    stake: 1.0,
    tp: 100.0,
    sl: 10.0,
    martingale: 1.95,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 5,
    maxRuns: 50,
  },
  {
    id: "mega-mind",
    name: "ArkTraders MegaMind Overdrive",
    iconKey: "brain",
    desc: "Digit Over scalper inspired by the Mega Mind sequence. Uses measured recovery and fast tick execution.",
    market: "1HZ10V",
    tradeType: "over_under",
    contractType: "over",
    stake: 5.97,
    tp: 500.0,
    sl: 100.0,
    martingale: 2.0,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 3,
    maxRuns: 50,
  },
  {
    id: "osam-hnr",
    name: "ArkTraders HitRun Phantom",
    iconKey: "flame",
    desc: "High-velocity Digit Odd sniper from the Osam HnR asset. Designed for short, decisive Volatility 100 bursts.",
    market: "R_100",
    tradeType: "even_odd",
    contractType: "odd",
    stake: 1.0,
    tp: 10.0,
    sl: 5.0,
    martingale: 2.0,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 5,
    maxRuns: 25,
  },
  {
    id: "candle-mine",
    name: "ArkTraders CandleVault Diff",
    iconKey: "zap",
    desc: "Digit Diff specialist from Candle Mine. Targets differs contracts with aggressive recovery controls.",
    market: "R_100",
    tradeType: "matches_differs",
    contractType: "differs",
    stake: 110.0,
    tp: 9999.0,
    sl: 9999.0,
    martingale: 11.0,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 5,
    maxRuns: 25,
  },
  {
    id: "dec-entry",
    name: "ArkTraders DEC Entry Sniper",
    iconKey: "target",
    desc: "Entry-point driven Digit Over setup. Built for traders who want precise trigger-based execution.",
    market: "1HZ10V",
    tradeType: "over_under",
    contractType: "over",
    stake: 1.0,
    tp: 2.0,
    sl: 2.0,
    martingale: 2.0,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 7,
    maxRuns: 25,
  },
  {
    id: "osam-autobot",
    name: "ArkTraders Osam AutoPilot",
    iconKey: "shield",
    desc: "Auto Bot by Osam, adapted from the Osam asset into a deployable ArkTrader preset for disciplined Digit Odd sessions.",
    market: "R_100",
    tradeType: "even_odd",
    contractType: "odd",
    stake: 1.0,
    tp: 10.0,
    sl: 5.0,
    martingale: 2.0,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 5,
    maxRuns: 25,
  },
  {
    id: "under-pro-bot",
    name: "ArkTraders UnderPro Sentinel",
    iconKey: "radar",
    desc: "Under-Pro bot adapted from the Under-focused asset logic. Tuned for Digit Under entries on Volatility 100 (1s).",
    market: "1HZ100V",
    tradeType: "over_under",
    contractType: "under",
    stake: 1.0,
    tp: 100.0,
    sl: 10.0,
    martingale: 1.95,
    duration: 1,
    durationUnit: "t",
    predictionDigit: 5,
    maxRuns: 50,
  },
];
