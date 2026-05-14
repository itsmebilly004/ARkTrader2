import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Tables<"trades">[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadTrades = () =>
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (cancelled || error) return;
          setTrades(data ?? []);
        });
    void loadTrades();
    const channel = supabase
      .channel(`analytics-trades-${user.id}`)
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

  const stats = useMemo(() => {
    const wins = trades.filter((t) => t.status === "won").length;
    const losses = trades.filter((t) => t.status === "lost").length;
    const total = trades.length;
    const totalStake = trades.reduce((a, t) => a + Number(t.stake ?? 0), 0);
    const profit = trades.reduce((a, t) => a + Number(t.profit_loss ?? 0), 0);
    const roi = totalStake ? (profit / totalStake) * 100 : 0;
    let cum = 0;
    const equity = trades.map((t) => {
      cum += Number(t.profit_loss ?? 0);
      return { x: new Date(t.created_at).toLocaleString(), y: Number(cum.toFixed(2)) };
    });
    const reversed = [...trades].reverse();
    return {
      wins,
      losses,
      total,
      profit,
      roi,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
      equity,
      reversed,
    };
  }, [trades]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Performance across all your trades.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total trades", value: stats.total },
          { label: "Wins / Losses", value: `${stats.wins} / ${stats.losses}` },
          { label: "Win rate", value: `${stats.winRate.toFixed(1)}%` },
          {
            label: "ROI",
            value: `${stats.roi.toFixed(2)}%`,
            accent: stats.roi >= 0 ? "text-success" : "text-destructive",
          },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={`mt-3 font-mono text-2xl ${s.accent ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-4 text-sm font-medium">Equity curve</h3>
        <div className="h-72 w-full">
          {stats.equity.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.equity}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.16 230)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.78 0.16 230)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(1 0 0 / 0.05)" />
                <XAxis dataKey="x" hide />
                <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.02 260)",
                    border: "1px solid oklch(1 0 0 / 0.1)",
                    borderRadius: 8,
                  }}
                  formatter={(value: unknown) => [`${Number(value).toFixed(2)}`, "Equity"]}
                />
                <Area
                  type="monotone"
                  dataKey="y"
                  stroke="oklch(0.78 0.16 230)"
                  fill="url(#g)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <h3 className="mb-4 text-sm font-medium">Trade history</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-glass-border">
                <th className="py-2 text-left">Time</th>
                <th className="py-2 text-left">Market</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-right">Stake</th>
                <th className="py-2 text-right">P&L</th>
                <th className="py-2 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No trades yet.
                  </td>
                </tr>
              ) : (
                stats.reversed.map((t) => (
                  <tr key={t.id} className="border-b border-glass-border/50">
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 font-mono text-xs">{t.symbol}</td>
                    <td className="py-2 font-mono text-xs">{t.trade_type}</td>
                    <td className="py-2 text-right font-mono">{Number(t.stake).toFixed(2)}</td>
                    <td
                      className={`py-2 text-right font-mono ${Number(t.profit_loss) >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {Number(t.profit_loss ?? 0) >= 0 ? "+" : ""}
                      {Number(t.profit_loss ?? 0).toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                          t.status === "won"
                            ? "bg-success/20 text-success"
                            : t.status === "lost"
                              ? "bg-destructive/20 text-destructive"
                              : "bg-foreground/5 text-muted-foreground"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
