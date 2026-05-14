import { createFileRoute } from "@tanstack/react-router";
import { TopShell, PageHero } from "@/components/top-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/copy-trading")({
  head: () => ({
    meta: [
      { title: "Copy Trading - ArkTrader Hub" },
      {
        name: "description",
        content: "Copy-trading discovery for ArkTrader Hub. Live mirroring is not enabled yet.",
      },
    ],
  }),
  component: CopyTrading,
});

const TRADERS = [
  { name: "AlphaQuant", roi: "+182%", followers: 1240 },
  { name: "VolMaster", roi: "+97%", followers: 856 },
  { name: "DigitWizard", roi: "+64%", followers: 523 },
];

function CopyTrading() {
  return (
    <TopShell>
      <PageHero
        title="Copy Trading"
        subtitle="Copy-trading discovery is under development. Manual trader and trading bots are the live Deriv execution paths today."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {TRADERS.map((t) => (
            <div
              key={t.name}
              className="min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="size-10 rounded-full bg-gradient-to-br from-[oklch(0.55_0.22_265)] to-[oklch(0.4_0.2_280)]" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.followers} followers</div>
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold text-[oklch(0.55_0.18_150)]">{t.roi}</div>
              <div className="text-xs text-muted-foreground">12-month ROI</div>
              <Button
                size="sm"
                disabled
                title="Copy trading is not live yet"
                className="mt-4 w-full bg-[oklch(0.55_0.22_265)] text-white disabled:opacity-60"
              >
                Coming soon
              </Button>
            </div>
          ))}
        </div>
      </PageHero>
    </TopShell>
  );
}
