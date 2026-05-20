import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopShell, PageHero } from "@/components/top-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { recordBotPresetActivity } from "@/lib/activity-memory";
import { importBotXmlIntoBuilderMemory } from "@/lib/bot-builder-memory";
import { ensureBotXmlPresets, fetchBotXmlFromDatabase } from "@/lib/bot-xml-storage";
import { TRADING_BOT_ASSETS, type TradingBotAsset } from "@/lib/trading-bot-database";
import { Zap, Target, Cpu, BrainCircuit, Flame, Rocket, Shield } from "lucide-react";

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
  rocket: Rocket,
  shield: Shield,
  target: Target,
  zap: Zap,
};

export const BOT_PRESETS = TRADING_BOT_ASSETS.map((preset) => ({
  ...preset,
  icon: ICONS[preset.iconKey],
}));

function TradingBots() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoadingLibrary(true);
    setLoadError(null);
    ensureBotXmlPresets()
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Could not sync bot presets to database.";
        if (!cancelled) setLoadError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingLibrary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleDeployBot(bot: TradingBotAsset) {
    if (!user?.id) {
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    setDeployingId(bot.id);
    try {
      const xml = await fetchBotXmlFromDatabase(bot.id);
      await importBotXmlIntoBuilderMemory(user.id, { name: bot.name, xml, presetId: bot.id });
      recordBotPresetActivity(user.id, "deployed", bot.name, bot.id);
      toast.success(`Imported "${bot.name}" into the bot builder.`);
      navigate({ to: "/bot-builder" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not deploy this bot preset.";
      toast.error(message);
    } finally {
      setDeployingId(null);
    }
  }

  return (
    <TopShell>
      <PageHero
        title="Trading Bot Presets"
        subtitle="Deployment-ready XML bot presets stored in your bot database and imported into the builder memory."
      >
        {loadError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}
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
                    {user ? (
                      <Button
                        size="lg"
                        className="w-full rounded-xl font-bold shadow-glow"
                        disabled={loadingLibrary || deployingId === b.id}
                        onClick={() => void handleDeployBot(b)}
                      >
                        {deployingId === b.id ? "Deploying..." : "Deploy Bot"}
                      </Button>
                    ) : (
                      <Button asChild size="lg" className="w-full rounded-xl font-bold shadow-glow">
                        <Link to="/auth" search={{ mode: "signin" }}>
                          Sign in to deploy
                        </Link>
                      </Button>
                    )}
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
