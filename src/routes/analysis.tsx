import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopShell } from "@/components/top-shell";
import { fetchTicks, subscribeTicks, SYNTHETIC_MARKETS } from "@/lib/deriv";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { readRememberedMarket, rememberMarketSelection } from "@/lib/activity-memory";
import { calculateDigitStats, digitsFromPrices, lastDigitFromPrice } from "@/lib/digit-stats";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis Tool — ArkTrader Hub" },
      {
        name: "description",
        content: "Live last-digit and tick analysis for Deriv synthetic indices.",
      },
    ],
  }),
  component: Analysis,
});

const TABS = ["Dcircles", "Signals", "DP Tools", "Tick Analyser"] as const;
type Tab = (typeof TABS)[number];

const DIGIT_COLORS = [
  "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
  "border-orange-400 bg-orange-400 text-white",
  "border-rose-500 bg-rose-500 text-white",
  "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
  "border-emerald-500 bg-emerald-500 text-white",
  "border-sky-500 bg-sky-500 text-white",
  "border-orange-400 bg-orange-400 text-white",
  "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
  "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
  "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
];

function Analysis() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Dcircles");
  const [symbol, setSymbol] = useState(
    () => readRememberedMarket(undefined, "analysis", "1HZ10V") ?? "1HZ10V",
  );
  const [window, setWindow] = useState<number>(1000);
  const [windowInput, setWindowInput] = useState<string>("1000");
  const [ticks, setTicks] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    const remembered = readRememberedMarket(user?.id, "analysis");
    if (!remembered) return;
    setSymbol((current) => (current === remembered ? current : remembered));
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    let off: (() => void) | undefined;
    setTicks([]);
    setLast(null);
    fetchTicks(symbol, 500)
      .then((initialTicks) => {
        if (!active) return;
        setTicks(initialTicks.map((tick) => tick.value));
        const latest = initialTicks.at(-1)?.value;
        if (latest != null) setLast(latest);
      })
      .catch(() => {
        /* network/timeout handled by live subscription */
      })
      .finally(() => {
        subscribeTicks(symbol, (price) => {
          if (!active) return;
          setLast(price);
          setTicks((prev) => {
            const next = [...prev, price];
            if (next.length > 5000) next.splice(0, next.length - 5000);
            return next;
          });
        }).then((unsubscribe) => {
          if (active) off = unsubscribe;
          else unsubscribe();
        });
      });
    return () => {
      active = false;
      off?.();
    };
  }, [symbol]);

  const slice = useMemo(() => ticks.slice(-window), [ticks, window]);
  const digits = useMemo(
    () => slice.map(lastDigitFromPrice).filter((digit): digit is number => digit != null),
    [slice],
  );
  const dcircleDigits = useMemo(() => digitsFromPrices(ticks, 500), [ticks]);
  const dcircleStats = useMemo(() => calculateDigitStats(dcircleDigits), [dcircleDigits]);
  const counts = useMemo(() => dcircleStats.counts, [dcircleStats]);
  const total = Math.max(dcircleDigits.length, 1);
  const pcts = dcircleStats.percentages;
  const maxPct = Math.max(...pcts);
  const minPct = Math.min(...pcts);
  const currentDigit = dcircleStats.latest;
  const marketName = SYNTHETIC_MARKETS.find((m) => m.symbol === symbol)?.name ?? symbol;

  // Signals: last-N streak analysis
  const streakLen = 10;
  const recentDigits = digits.slice(-streakLen);
  const evenCount = recentDigits.filter((d) => d % 2 === 0).length;
  const oddCount = streakLen - evenCount;
  const overCount = recentDigits.filter((d) => d > 4).length;
  const underCount = streakLen - overCount;
  const lastStreakDigit = recentDigits.length ? recentDigits[recentDigits.length - 1] : null;
  const consecutiveSame = (() => {
    let n = 0;
    for (let i = recentDigits.length - 1; i >= 0; i--) {
      if (recentDigits[i] === lastStreakDigit) n++;
      else break;
    }
    return n;
  })();

  // DP Tools: probability distribution for consecutive event
  const overUnderProbs = Array.from({ length: 10 }, (_, d) => ({
    digit: d,
    overProb: ((9 - d) / 10) * 100,
    underProb: (d / 10) * 100,
    matchProb: 10,
    diffProb: 90,
  }));

  return (
    <TopShell>
      <div className="mx-auto w-full max-w-6xl min-w-0 px-3 py-4 sm:px-4 sm:py-6 md:px-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md border px-4 py-2 text-xs font-semibold transition",
                tab === t
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Shared market + window controls */}
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:flex lg:flex-wrap lg:items-end lg:gap-4">
          <div className="min-w-0 lg:min-w-[200px] lg:flex-1">
            <label className="block text-sm font-semibold text-foreground">Market</label>
            <Select
              value={symbol}
              onValueChange={(value) => {
                setSymbol(value);
                rememberMarketSelection(user?.id, "analysis", value);
              }}
            >
              <SelectTrigger className="mt-1 h-10 w-full rounded-md border-input bg-background text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNTHETIC_MARKETS.map((m) => (
                  <SelectItem key={m.symbol} value={m.symbol}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <label className="block text-sm font-semibold text-foreground">Ticks window</label>
            <Input
              type="number"
              min={50}
              max={5000}
              value={windowInput}
              onChange={(e) => {
                setWindowInput(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 50 && n <= 5000) setWindow(Math.floor(n));
              }}
              className="mt-1 h-10 w-full text-center sm:w-28"
            />
          </div>
          <div className="min-w-0 rounded-md bg-muted px-4 py-2 text-center sm:col-span-2 lg:col-span-1">
            <div className="font-mono text-2xl font-bold text-foreground">
              {last !== null ? last.toFixed(2) : "—"}
            </div>
            <div className="truncate text-[10px] text-muted-foreground uppercase tracking-wider">
              {marketName}
            </div>
          </div>
          <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
            Samples: {tab === "Dcircles" ? dcircleDigits.length : digits.length}
          </div>
        </div>

        {/* DCIRCLES TAB */}
        {tab === "Dcircles" && (
          <div className="mt-6">
            <div className="text-sm font-semibold text-foreground">
              Last {dcircleDigits.length} ticks — digit distribution
            </div>
            <div className="mt-6 grid grid-cols-5 gap-y-8 sm:grid-cols-10">
              {counts.map((_c, i) => {
                const pct = pcts[i];
                const isMax = pct === maxPct && total > 1;
                const isMin = pct === minPct && total > 1 && !isMax;
                const isCurrent = currentDigit === i;
                return (
                  <div key={i} className="relative flex flex-col items-center">
                    {isCurrent && (
                      <div className="absolute -top-6 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                        ▾
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold transition",
                        DIGIT_COLORS[i],
                        isCurrent && "ring-4 ring-blue-200",
                      )}
                    >
                      {i}
                    </div>
                    <div className="mt-1 text-xs font-semibold">{counts[i]}</div>
                    <div className="text-xs text-muted-foreground">{pct.toFixed(1)}%</div>
                    {isMax && (
                      <div className="mt-0.5 text-[9px] font-semibold text-blue-600">↑ most</div>
                    )}
                    {isMin && (
                      <div className="mt-0.5 text-[9px] font-semibold text-muted-foreground">
                        ↓ least
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {currentDigit !== null && (
              <div className="mt-4 text-xs text-muted-foreground">
                current digit: <span className="font-semibold text-foreground">{currentDigit}</span>
              </div>
            )}
          </div>
        )}

        {/* SIGNALS TAB */}
        {tab === "Signals" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Real-time signals derived from the last <strong>{streakLen}</strong> ticks.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Even/Odd signal */}
              <SignalCard
                title="Even / Odd"
                label={evenCount >= oddCount ? "Even suggested" : "Odd suggested"}
                confidence={Math.round((Math.max(evenCount, oddCount) / streakLen) * 100)}
                color={evenCount >= oddCount ? "green" : "slate"}
                detail={`Even: ${evenCount} | Odd: ${oddCount} in last ${streakLen}`}
              />
              {/* Over/Under 4 signal */}
              <SignalCard
                title="Over / Under 4"
                label={overCount >= underCount ? "Over 4 suggested" : "Under 4 suggested"}
                confidence={Math.round((Math.max(overCount, underCount) / streakLen) * 100)}
                color={overCount >= underCount ? "blue" : "orange"}
                detail={`Over: ${overCount} | Under: ${underCount} in last ${streakLen}`}
              />
              {/* Streak signal */}
              <SignalCard
                title="Streak"
                label={consecutiveSame >= 3 ? `Streak of ${consecutiveSame}` : "No streak"}
                confidence={consecutiveSame >= 3 ? Math.min(95, consecutiveSame * 20) : 0}
                color={consecutiveSame >= 3 ? "rose" : "slate"}
                detail={`Last digit ${lastStreakDigit ?? "—"} repeated ${consecutiveSame}× in a row`}
              />
              {/* Most frequent digit signal */}
              <SignalCard
                title="Hot Digit"
                label={`Digit ${pcts.indexOf(maxPct)} is hot`}
                confidence={Math.round(maxPct)}
                color="amber"
                detail={`${maxPct.toFixed(1)}% frequency in last ${window} ticks`}
              />
            </div>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <Info className="inline h-3.5 w-3.5 mr-1" />
              Signals are statistical observations only — not financial advice. Deriv markets are
              random-walk processes; past frequency does not predict future outcomes.
            </div>
          </div>
        )}

        {/* DP TOOLS TAB */}
        {tab === "DP Tools" && (
          <div className="mt-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Theoretical probability table for each last-digit prediction.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/70">
                    <th className="px-3 py-2 text-left font-semibold text-foreground">Digit</th>
                    <th className="px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-300">
                      Over %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-rose-700 dark:text-rose-300">
                      Under %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                      Matches %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                      Differs %
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-violet-700 dark:text-violet-300">
                      Observed %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overUnderProbs.map(({ digit, overProb, underProb, matchProb, diffProb }) => (
                    <tr key={digit} className="border-b border-border transition hover:bg-muted/60">
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                            DIGIT_COLORS[digit],
                            currentDigit === digit && "ring-2 ring-blue-400",
                          )}
                        >
                          {digit}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-700 dark:text-blue-300">
                        {overProb.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-rose-700 dark:text-rose-300">
                        {underProb.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">
                        {matchProb.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {diffProb.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-violet-700 dark:text-violet-300">
                        {pcts[digit].toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Theoretical probabilities assume a uniform random distribution. Observed % is from
              your current ticks window.
            </p>
          </div>
        )}

        {/* TICK ANALYSER TAB */}
        {tab === "Tick Analyser" && (
          <div className="mt-6">
            <p className="mb-3 text-sm text-muted-foreground">Last 50 raw ticks</p>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
              {ticks.slice(-50).map((t, i) => {
                const d = Number(t.toFixed(2).slice(-1));
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col items-center rounded-md border py-1.5 text-center",
                      DIGIT_COLORS[d],
                    )}
                  >
                    <span className="font-mono text-xs font-bold">{d}</span>
                    <span className="font-mono text-[9px] text-current/70">{t.toFixed(2)}</span>
                  </div>
                );
              })}
              {ticks.length === 0 && (
                <div className="col-span-10 rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  Waiting for ticks…
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-card p-2 text-center text-xs text-card-foreground"
                >
                  <div
                    className={cn(
                      "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold",
                      DIGIT_COLORS[i],
                    )}
                  >
                    {i}
                  </div>
                  <div className="font-mono font-semibold">{counts[i]}</div>
                  <div className="text-muted-foreground">{pcts[i].toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TopShell>
  );
}

function SignalCard({
  title,
  label,
  confidence,
  color,
  detail,
}: {
  title: string;
  label: string;
  confidence: number;
  color: "green" | "blue" | "orange" | "rose" | "slate" | "amber";
  detail: string;
}) {
  const colorMap = {
    green:
      "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200",
    blue: "bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-200",
    orange:
      "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-200",
    rose: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-200",
    slate:
      "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-500/10 dark:border-slate-500/30 dark:text-slate-200",
    amber:
      "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200",
  };
  const barMap = {
    green: "bg-emerald-400",
    blue: "bg-sky-400",
    orange: "bg-orange-400",
    rose: "bg-rose-400",
    slate: "bg-slate-400",
    amber: "bg-amber-400",
  };
  return (
    <div className={cn("rounded-xl border p-4", colorMap[color])}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{title}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-current/10">
        <div
          className={cn("h-1.5 rounded-full transition-all", barMap[color])}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] font-medium">{confidence}% confidence</div>
      <div className="mt-2 text-[10px] opacity-60">{detail}</div>
    </div>
  );
}
