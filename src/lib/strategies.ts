export type StrategyStep = { title: string; body: string };

export type Strategy = {
  slug: string;
  name: string;
  tagline: string;
  overview: string;
  bestFor: string[];
  riskLevel: "Low" | "Medium" | "High";
  recommendedMarkets: string[];
  steps: StrategyStep[];
  tips: string[];
  pitfalls: string[];
};

export const STRATEGIES: Strategy[] = [
  {
    slug: "over-under",
    name: "Over/Under",
    tagline: "Predict if price will finish above or below target",
    overview:
      "The Over/Under strategy uses the last digit of the exit spot. You pick a barrier digit (0–9) and predict whether the final digit will be over or under it. Great for beginners who want simple yes/no decisions on tick markets.",
    bestFor: ["Beginners", "Short-term traders", "Synthetic indices"],
    riskLevel: "Medium",
    recommendedMarkets: ["Volatility 10 (1s)", "Volatility 25", "Volatility 100"],
    steps: [
      {
        title: "Pick a market",
        body: "Start with Volatility 10 (1s) — it has fast ticks and a balanced digit distribution.",
      },
      {
        title: "Open the analysis tool",
        body: "Look at the last 1000 digits and find the barrier where 6+ digits sit on one side.",
      },
      {
        title: "Choose your barrier",
        body: "Common safe choices are Over 2 or Under 7 — these give ~70% statistical edge in calm conditions.",
      },
      {
        title: "Set duration to 1 tick",
        body: "Shorter durations reduce uncertainty. Use stake you can afford to lose.",
      },
      {
        title: "Place the trade",
        body: "Click Buy and wait for settlement. Move on to the next tick — never chase losses.",
      },
    ],
    tips: [
      "Track the digit distribution for at least 500 ticks before trading.",
      "Stop after 3 consecutive losses and reassess the market.",
      "Use 0.5–1% of your bankroll per trade.",
    ],
    pitfalls: [
      "Don't pick barriers near the median (4 or 5) — they offer almost no edge.",
      "Avoid trading during news events or volatility spikes.",
    ],
  },
  {
    slug: "odd",
    name: "Odd",
    tagline: "Forecast whether the final digit will be odd",
    overview:
      "The Odd strategy bets that the last digit of the exit price will be 1, 3, 5, 7, or 9. It works best when the analysis tool shows odd digits trending higher than 50%.",
    bestFor: ["Beginners", "Pattern traders"],
    riskLevel: "Medium",
    recommendedMarkets: ["Volatility 75", "Volatility 100 (1s)"],
    steps: [
      {
        title: "Open Analysis Tool",
        body: "Check the last-digit distribution for the past 1000 ticks.",
      },
      {
        title: "Confirm odd bias",
        body: "Sum the percentages of 1, 3, 5, 7, 9. Trade only if total > 52%.",
      },
      { title: "Set stake", body: "Use 1% of your account balance per trade." },
      { title: "Duration", body: "1 tick is recommended for digit contracts." },
      {
        title: "Buy DIGITODD",
        body: "Place the trade and let it settle. Repeat while bias persists.",
      },
    ],
    tips: ["Re-check the distribution every 50 trades.", "Combine with stop-loss after 5 losses."],
    pitfalls: ["Don't trade if odd vs even is 50/50 — there's no edge."],
  },
  {
    slug: "even",
    name: "Even",
    tagline: "Forecast whether the final digit will be even",
    overview:
      "The Even strategy is the mirror of Odd — it pays out when the last digit is 0, 2, 4, 6, or 8. Use it when the analysis tool shows an even-digit bias.",
    bestFor: ["Beginners", "Statistical traders"],
    riskLevel: "Medium",
    recommendedMarkets: ["Volatility 10", "Volatility 50"],
    steps: [
      { title: "Open Analysis Tool", body: "Look at the digit circles for the past 1000 ticks." },
      { title: "Confirm even bias", body: "Sum 0, 2, 4, 6, 8 — trade only if > 52%." },
      { title: "Stake & duration", body: "1% per trade, 1 tick duration." },
      { title: "Buy DIGITEVEN", body: "Execute the trade and wait for settlement." },
      { title: "Reassess", body: "Recheck distribution every 50 trades. Stop if bias flips." },
    ],
    tips: [
      "Pair with martingale only if bankroll is large.",
      "Note the time of day — bias often shifts.",
    ],
    pitfalls: ["Avoid trading right after long losing streaks without re-analyzing."],
  },
  {
    slug: "hit-and-run",
    name: "Hit and Run",
    tagline: "Quick entry and exit strategy for fast profits",
    overview:
      "Hit and Run focuses on small, frequent wins. You enter trades only when conditions are perfect, take profit immediately, and exit. The discipline is in stopping after a target is hit — no greed.",
    bestFor: ["Active traders", "Day traders"],
    riskLevel: "High",
    recommendedMarkets: ["Volatility 100 (1s)", "Boom 500", "Crash 500"],
    steps: [
      {
        title: "Define daily target",
        body: "Pick a fixed profit goal (e.g. 5% of bankroll). Stop the moment it's hit.",
      },
      { title: "Wait for setup", body: "Only trade when both the EMA trend and digit bias agree." },
      {
        title: "Small stake, fast exit",
        body: "Use 0.5% of bankroll per trade. Take profit on the first winning tick.",
      },
      { title: "Hard stop-loss", body: "Stop after 3 losses or hitting -3% of daily bankroll." },
      {
        title: "Walk away",
        body: "When target is reached, close the platform. Discipline > more trades.",
      },
    ],
    tips: [
      "Set a timer — never trade more than 30 minutes per session.",
      "Journal every trade and review weekly.",
    ],
    pitfalls: [
      "Don't keep trading after hitting your target — losses come from greed.",
      "Avoid revenge trades after losses.",
    ],
  },
  {
    slug: "rise-fall",
    name: "Rise/Fall",
    tagline: "Predict the direction of the next move",
    overview:
      "Rise/Fall is the simplest contract: predict if the exit price is higher or lower than the entry. Combine with a moving-average trend filter for an edge.",
    bestFor: ["Beginners", "Trend traders"],
    riskLevel: "Low",
    recommendedMarkets: ["Volatility 75", "Volatility 100", "Bull/Bear Market Index"],
    steps: [
      { title: "Add an EMA", body: "Plot a 20-period EMA on the chart." },
      {
        title: "Identify trend",
        body: "Price above EMA = uptrend (Rise). Below EMA = downtrend (Fall).",
      },
      { title: "Set duration", body: "Use 5 ticks for synthetic indices." },
      {
        title: "Place trade",
        body: "Buy CALL for Rise, PUT for Fall — only in the trend direction.",
      },
      { title: "Manage risk", body: "Stop after 3 consecutive losses; trend likely flipped." },
    ],
    tips: ["Trade only with the trend — never counter-trend.", "Use 1–2% stake per trade."],
    pitfalls: ["Don't trade in flat/ranging markets — wait for a clear trend."],
  },
  {
    slug: "matches",
    name: "Matches/Differs",
    tagline: "Predict the exact final digit (or that it differs)",
    overview:
      "Pick a digit and bet whether the last digit of the exit price matches it. Differs is statistically safer (90% chance), Matches has higher payout but lower hit rate.",
    bestFor: ["Statistical traders", "Patient traders"],
    riskLevel: "Medium",
    recommendedMarkets: ["Volatility 25", "Volatility 50"],
    steps: [
      { title: "Analyze digits", body: "Find the rarest digit over the last 1000 ticks." },
      { title: "Bet Differs", body: "Predict the price won't end with the most-frequent digit." },
      { title: "1 tick duration", body: "Always use the shortest duration." },
      { title: "Small stakes", body: "Differs has small payouts — keep stakes proportional." },
      { title: "Review", body: "Recheck digit frequencies every 100 trades." },
    ],
    tips: [
      "Differs ~90% win rate, Matches ~10% win rate but 9x payout.",
      "Avoid Matches unless you're an experienced trader.",
    ],
    pitfalls: ["Don't pick Matches digits at random — always use the analysis tool."],
  },
  {
    slug: "martingale-recovery",
    name: "Martingale Recovery",
    tagline: "Double stake after losses to recover with one win",
    overview:
      "After every loss, double your stake. One win recovers all previous losses plus original profit. High risk — needs deep bankroll and strict stop-loss.",
    bestFor: ["Advanced traders", "Large bankrolls"],
    riskLevel: "High",
    recommendedMarkets: ["Volatility 10", "Volatility 25"],
    steps: [
      {
        title: "Pick a base stake",
        body: "Start with 0.1% of bankroll. After 7 losses, you'll be at 12.8%.",
      },
      {
        title: "Set max losses",
        body: "Cap martingale at 5 steps. Reset after 5 consecutive losses.",
      },
      {
        title: "Use a strategy with 50%+ edge",
        body: "Pair with Even, Odd, or Rise/Fall in trends.",
      },
      {
        title: "Double on loss",
        body: "After every loss, double the stake. Reset to base on win.",
      },
      { title: "Strict stop", body: "Stop trading for the day after hitting the cap." },
    ],
    tips: [
      "Use a calculator to know your max loss in advance.",
      "Never use rent or essential money.",
    ],
    pitfalls: [
      "Martingale eventually busts every account without a hard stop.",
      "Don't exceed 5 consecutive doubles.",
    ],
  },
  {
    slug: "scalping",
    name: "Tick Scalping",
    tagline: "Capture tiny moves with high-frequency trades",
    overview:
      "Tick scalping uses 1-tick contracts on volatile synthetic indices to extract small but consistent profits. Requires sharp focus, low fees, and a clear exit plan.",
    bestFor: ["Active traders", "Experienced traders"],
    riskLevel: "High",
    recommendedMarkets: ["Volatility 100 (1s)", "Volatility 75 (1s)"],
    steps: [
      { title: "Pick fast market", body: "1-second indices give the most opportunities." },
      { title: "Identify micro-trend", body: "Use the last 20 ticks to spot direction." },
      { title: "Trade in bursts", body: "Place 5–10 quick trades, then walk away for 10 minutes." },
      { title: "Hard stop-loss", body: "Stop after 3 consecutive losses or -2% of bankroll." },
      { title: "Take profits", body: "Withdraw winnings daily — don't let profits ride." },
    ],
    tips: [
      "Trade only during high liquidity hours.",
      "Take frequent breaks — fatigue kills scalpers.",
    ],
    pitfalls: [
      "Don't over-trade — quality > quantity.",
      "Avoid scalping during news or volatility spikes.",
    ],
  },
];

export function getStrategyBySlug(slug: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.slug === slug);
}
