// src/routes/trading-bots.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { TopShell, PageHero } from "@/components/top-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { recordBotPresetActivity } from "@/lib/activity-memory";
import { BOT_PRESET_CONFIGS } from "@/lib/bot-presets";
import { markDeployedBotPresetId } from "@/lib/bot-preset-storage";
import { Zap, Target, ShieldCheck, Cpu, BrainCircuit, Flame, Radar } from "lucide-react";

export const Route = createFileRoute("/trading-bots")({
  head: () => ({
    meta: [
      { title: "Trading Bot Presets - ArkTrader Hub" },
      {
        name: "description",
        content: "Launch professional-grade Deriv trading bot presets instantly.",
      },
    ],
  }),
  component: TradingBots,
});

const ICONS = {
  brain: BrainCircuit,
  cpu: Cpu,
  flame: Flame,
  radar: Radar,
  shield: ShieldCheck,
  target: Target,
  zap: Zap,
};

export const BOT_PRESETS = BOT_PRESET_CONFIGS.map((preset) => ({
  ...preset,
  icon: ICONS[preset.iconKey],
}));

function TradingBots() {
  const { user } = useAuth();
  return (
    <TopShell>
      <PageHero
        title="Trading Bot Presets"
        subtitle="Deployment-ready bot configurations from your library. Load them into the builder to start trading."
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {BOT_PRESETS.map((b) => (
            <div
              key={b.id}
              className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-card p-4 shadow-xl transition-all hover:border-primary/50 sm:p-6"
            >
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                  <b.icon className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold tracking-tight">{b.name}</div>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {b.desc}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {b.market}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {b.tradeType.replace("_", " ")}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {b.contractType}
                    </span>
                  </div>

                  <div className="mt-6">
                    <Button asChild size="lg" className="w-full rounded-xl font-bold shadow-glow">
                      {user ? (
                        <Link
                          to="/bot-builder"
                          search={{ preset: b.id }}
                          onClick={() => {
                            markDeployedBotPresetId(user.id, b.id);
                            recordBotPresetActivity(user.id, "deployed", b.name, b.id);
                          }}
                        >
                          Deploy Bot
                        </Link>
                      ) : (
                        <Link to="/auth" search={{ mode: "signin" }}>
                          Sign in to deploy
                        </Link>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageHero>
    </TopShell>
  );
}
