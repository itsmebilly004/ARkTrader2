import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TopShell } from "@/components/top-shell";
import { getStrategyBySlug, STRATEGIES, type Strategy, type StrategyStep } from "@/lib/strategies";
import { ArrowLeft, CheckCircle2, AlertTriangle, Lightbulb, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/strategy/$slug")({
  loader: ({ params }) => {
    const s = getStrategyBySlug(params.slug);
    if (!s) throw notFound();
    return s;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Strategy"} — ArkTrader Hub` },
      {
        name: "description",
        content: loaderData?.tagline ?? "Detailed beginner-friendly trading strategy guide.",
      },
    ],
  }),
  component: StrategyDetail,
});

function StrategyDetail() {
  const s = Route.useLoaderData() as Strategy;
  const riskColor =
    s.riskLevel === "Low"
      ? "bg-emerald-100 text-emerald-700"
      : s.riskLevel === "Medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  return (
    <TopShell>
      <div className="mx-auto w-full max-w-4xl min-w-0 px-3 py-6 sm:px-4 sm:py-10 md:px-8">
        <Link
          to="/strategies"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to strategies
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-2xl font-bold text-foreground sm:text-3xl md:text-4xl">
              {s.name}
            </h1>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskColor}`}>
              {s.riskLevel} risk
            </span>
          </div>
          <p className="mt-2 text-base text-muted-foreground">{s.tagline}</p>
        </header>

        <section className="mt-8 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">Overview</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.overview}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Best for
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {s.bestFor.map((b: string) => (
                  <li
                    key={b}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommended markets
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {s.recommendedMarkets.map((m: string) => (
                  <li key={m} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">Step-by-step execution</h2>
          <ol className="mt-4 space-y-4">
            {s.steps.map((step: StrategyStep, idx: number) => (
              <li key={idx} className="flex min-w-0 gap-3 sm:gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {idx + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Lightbulb className="h-5 w-5 text-amber-500" /> Tips
            </h2>
            <ul className="mt-3 space-y-2">
              {s.tips.map((t: string) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-border sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <AlertTriangle className="h-5 w-5 text-rose-500" /> Pitfalls to avoid
            </h2>
            <ul className="mt-3 space-y-2">
              {s.pitfalls.map((p: string) => (
                <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white sm:p-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Ready to try this strategy?</h3>
            <p className="text-sm text-white/80">Open the bot builder and load the parameters.</p>
          </div>
          <Link
            to="/bot-builder"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow hover:bg-slate-100 sm:w-auto"
          >
            Open Bot Builder <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            More strategies
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {STRATEGIES.filter((x) => x.slug !== s.slug).map((other) => (
              <Link
                key={other.slug}
                to="/strategy/$slug"
                params={{ slug: other.slug }}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
              >
                {other.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </TopShell>
  );
}
