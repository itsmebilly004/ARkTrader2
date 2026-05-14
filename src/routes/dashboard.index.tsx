import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import {
  Wallet,
  TrendingUp,
  Activity,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYNTHETIC_MARKETS } from "@/lib/deriv";
import { Link } from "@tanstack/react-router";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm backdrop-blur-sm sm:p-5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div
        className={`mt-3 break-words font-mono text-xl sm:text-2xl ${accent ?? "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function DashboardHome() {
  const { user } = useAuth();
  const { balance, currency } = useDerivBalanceContext();
  const [trades, setTrades] = useState<Tables<"trades">[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadTrades = () =>
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data, error }) => {
          if (!cancelled && !error) setTrades(data ?? []);
        });
    void loadTrades();
    const channel = supabase
      .channel(`dashboard-trades-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `user_id=eq.${user.id}` },
        () => {
          void loadTrades();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const totalPL = trades.reduce((a, t) => a + Number(t.profit_loss ?? 0), 0);
  const wins = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Here's a snapshot of your trading activity.</p>
      </div>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Account balance"
          value={balance != null ? `${balance.toFixed(2)} ${currency}` : "—"}
          accent="text-foreground"
        />
        <StatCard
          icon={Wallet}
          label="Total P&L"
          value={`${totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}`}
          accent={totalPL >= 0 ? "text-success" : "text-destructive"}
        />
        <StatCard icon={Activity} label="Trades" value={trades.length} />
        <StatCard icon={TrendingUp} label="Win rate" value={`${winRate}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent trades */}
        <div className="min-w-0 rounded-xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm backdrop-blur-sm sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Recent trades</h3>
            <Link to="/dashboard/analytics" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No trades yet — head to the Trade desk.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-4 bg-[oklch(0.7_0.17_150)] text-white hover:bg-[oklch(0.65_0.17_150)]"
              >
                <Link to="/">Start trading</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {trades.map((t) => {
                const win = t.status === "won";
                const loss = t.status === "lost";
                return (
                  <li
                    key={t.id}
                    className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {win ? (
                        <ArrowUpRight className="size-4 text-success" />
                      ) : loss ? (
                        <ArrowDownRight className="size-4 text-destructive" />
                      ) : (
                        <Activity className="size-4 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs text-foreground">{t.symbol}</div>
                        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t.trade_type}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono">
                      <div
                        className={
                          win ? "text-success" : loss ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        {Number(t.profit_loss ?? 0) >= 0 ? "+" : ""}
                        {Number(t.profit_loss ?? 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        stake {Number(t.stake).toFixed(2)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Markets quick-launch */}
        <div className="min-w-0 rounded-xl border border-border bg-card/80 p-4 text-card-foreground shadow-sm backdrop-blur-sm sm:p-5">
          <h3 className="text-sm font-medium text-foreground">Markets</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {SYNTHETIC_MARKETS.slice(0, 5).map((m) => (
              <li
                key={m.symbol}
                className="flex items-center justify-between rounded-lg border border-border bg-background/70 px-3 py-2"
              >
                <span className="min-w-0 truncate text-muted-foreground">{m.name}</span>
                <span className="font-mono text-xs text-foreground">{m.symbol}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link to="/">Open trade desk</Link>
          </Button>

          <Button
            asChild
            className="mt-2 w-full bg-[oklch(0.7_0.17_150)] text-white hover:bg-[oklch(0.65_0.17_150)]"
          >
            <Link to="/bot-builder">
              <Bot className="mr-1.5 size-4" /> Launch bot builder
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
