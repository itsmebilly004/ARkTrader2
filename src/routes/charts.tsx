import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopShell } from "@/components/top-shell";
import { TvChart } from "@/components/tv-chart";
import { useAuth } from "@/hooks/use-auth";
import { readRememberedMarket, rememberMarketSelection } from "@/lib/activity-memory";

export const Route = createFileRoute("/charts")({
  head: () => ({
    meta: [
      { title: "Live Charts — ArkTrader Hub" },
      {
        name: "description",
        content: "Real-time charts for all synthetic indices and forex pairs.",
      },
    ],
  }),
  component: ChartsPage,
});

function computeChartHeight() {
  if (typeof window === "undefined") return 600;
  const narrow = window.innerWidth < 640;
  return Math.max(narrow ? 280 : 400, window.innerHeight - (narrow ? 260 : 180));
}

function ChartsPage() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState(
    () => readRememberedMarket(undefined, "charts", "R_100") ?? "R_100",
  );
  const [chartHeight, setChartHeight] = useState(() => computeChartHeight());

  useEffect(() => {
    const remembered = readRememberedMarket(user?.id, "charts");
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

  return (
    <TopShell>
      <div className="min-w-0 bg-card p-2 text-card-foreground sm:p-3 dark:bg-[#101010]">
        <TvChart
          symbol={symbol}
          onSymbolChange={(nextSymbol) => {
            setSymbol(nextSymbol);
            rememberMarketSelection(user?.id, "charts", nextSymbol);
          }}
          height={chartHeight}
          showSymbolSelector
        />
      </div>
    </TopShell>
  );
}
