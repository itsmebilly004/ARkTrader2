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
import type { Tables } from "@/integrations/supabase/types";

type UserSettings = Tables<"user_settings">;

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { accounts } = useDerivBalanceContext();
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

  return (
    <div className="w-full max-w-3xl min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your accounts, risk controls, and preferences.</p>
      </div>

      <section className="glass-card rounded-xl p-5">
        <h3 className="mb-4 text-sm font-medium">Trading accounts</h3>
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
                          : "bg-success/20 text-success"
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
