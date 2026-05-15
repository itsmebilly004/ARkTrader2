import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { RotateCcw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { DerivAccount } from "@/hooks/use-deriv-balance";

type UserSettings = Tables<"user_settings">;

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function BalanceResetRow({ account, onReset }: { account: DerivAccount; onReset: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    const amount = parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid amount (0 or greater).");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("accounts")
      .update({ balance: amount, updated_at: new Date().toISOString() })
      .eq("loginid", account.loginid);
    setBusy(false);
    if (error) {
      toast.error("Could not reset balance: " + error.message);
    } else {
      toast.success(
        `${account.is_demo ? "Demo" : "Real"} account balance reset to ${amount.toFixed(2)} ${account.currency ?? "USD"}.`,
      );
      setValue("");
      onReset();
    }
  }

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 py-4 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm font-medium">{account.account_id}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
              account.is_demo
                ? "bg-foreground/5 text-muted-foreground"
                : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {account.is_demo ? "Demo" : "Real"}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
          Current: {Number(account.balance ?? 0).toFixed(2)} {account.currency ?? "USD"}
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
        <div className="relative w-full sm:w-36">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
            {account.currency ?? "USD"}
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="pl-10 font-mono text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleReset();
            }}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || value === ""}
          onClick={handleReset}
          className="shrink-0 gap-1.5"
        >
          <RotateCcw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Saving…" : "Reset"}
        </Button>
      </div>
    </li>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  const { accounts, refreshBalances } = useDerivBalanceContext();
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: sett, error: settErr } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (settErr) { toast.error("Could not load settings"); return; }
    setSettings(
      sett ?? {
        created_at: new Date().toISOString(),
        daily_loss_limit: 50,
        default_demo: true,
        default_stake: 1,
        default_duration: "5t",
        max_consecutive_losses: 5,
        max_stake: 25,
        preferred_symbol: "R_100",
        theme: "dark",
        updated_at: new Date().toISOString(),
        user_id: user.id,
      },
    );
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function saveSettings() {
    if (!user || !settings) return;
    const { error } = await supabase.from("user_settings").upsert({ ...settings, user_id: user.id });
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  async function deleteAccount() {
    if (!user) return;
    if (!confirm("Permanently delete your account and all data?")) return;
    const results = await Promise.all([
      supabase.from("accounts").delete().eq("user_id", user.id),
      supabase.from("trades").delete().eq("user_id", user.id),
      supabase.from("bots").delete().eq("user_id", user.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) { toast.error("Partial deletion failed: " + failed.error.message); return; }
    await supabase.auth.signOut();
    toast.success("Account data cleared.");
    window.location.href = "/";
  }

  const realAccounts = accounts.filter((a) => !a.is_demo);
  const demoAccounts = accounts.filter((a) => a.is_demo);

  return (
    <div className="w-full max-w-3xl min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your accounts, risk controls, and preferences.</p>
      </div>

      {/* ── Account overview ── */}
      <section className="glass-card rounded-xl p-5">
        <h3 className="mb-1 text-sm font-medium">Trading accounts</h3>
        <p className="mb-4 text-xs text-muted-foreground">Your linked real and demo accounts.</p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts found.</p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {accounts.map((a) => (
              <li key={a.account_id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm">{a.account_id}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        a.is_demo
                          ? "bg-foreground/5 text-muted-foreground"
                          : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {a.is_demo ? "Demo" : "Live"}
                    </span>
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {Number(a.balance ?? 0).toFixed(2)} {a.currency}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Reset balance ── */}
      <section className="glass-card rounded-xl p-5">
        <h3 className="mb-1 text-sm font-medium">Reset account balance</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Set any balance you like on your real or demo account. The new amount is saved immediately to the
          database and reflected in your trading balance.
        </p>

        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts to reset.</p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {realAccounts.length > 0 && (
              <>
                <li className="pb-1 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Real accounts
                  </span>
                </li>
                {realAccounts.map((a) => (
                  <BalanceResetRow
                    key={a.account_id}
                    account={a}
                    onReset={() => void refreshBalances("settings-reset")}
                  />
                ))}
              </>
            )}
            {demoAccounts.length > 0 && (
              <>
                <li className="pb-1 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Demo accounts
                  </span>
                </li>
                {demoAccounts.map((a) => (
                  <BalanceResetRow
                    key={a.account_id}
                    account={a}
                    onReset={() => void refreshBalances("settings-reset")}
                  />
                ))}
              </>
            )}
          </ul>
        )}
      </section>

      {/* ── Risk controls ── */}
      {settings && (
        <section className="glass-card rounded-xl p-5">
          <h3 className="mb-4 text-sm font-medium">Risk controls</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Daily loss limit</Label>
              <Input
                type="number"
                value={settings.daily_loss_limit ?? ""}
                onChange={(e) => setSettings({ ...settings, daily_loss_limit: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max stake per trade</Label>
              <Input
                type="number"
                value={settings.max_stake ?? ""}
                onChange={(e) => setSettings({ ...settings, max_stake: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max consecutive losses</Label>
              <Input
                type="number"
                value={settings.max_consecutive_losses ?? ""}
                onChange={(e) => setSettings({ ...settings, max_consecutive_losses: Number(e.target.value) })}
              />
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-glass-border bg-foreground/[0.02] p-3">
              <div className="min-w-0">
                <Label>Default to demo</Label>
                <p className="text-[11px] text-muted-foreground">New trades &amp; bots default to demo.</p>
              </div>
              <Switch
                checked={!!settings.default_demo}
                onCheckedChange={(v) => setSettings({ ...settings, default_demo: v })}
              />
            </div>
          </div>
          <Button className="mt-4 w-full sm:w-auto" onClick={saveSettings}>Save settings</Button>
        </section>
      )}

      {/* ── Danger zone ── */}
      <section className="glass-card rounded-xl border-destructive/30 p-5">
        <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
        <p className="mt-1 text-sm text-muted-foreground">Permanently remove your data from ArkTrader Hub.</p>
        <Button variant="destructive" className="mt-4 w-full sm:w-auto" onClick={deleteAccount}>
          Delete account &amp; data
        </Button>
      </section>
    </div>
  );
}
