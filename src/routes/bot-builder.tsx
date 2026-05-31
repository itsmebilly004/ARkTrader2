import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { BotBuilder } from "@/external/bot-builder/BotBuilder";
import { getBlocklyRuntime, getDerivWorkspace } from "@/external/bot-builder/blockly-runtime";
import { persistWorkspaceSnapshot } from "@/external/bot-builder/workspace-persistence";
import { TopShell } from "@/components/top-shell";
import { BotRunMonitorPanel } from "@/components/bot-run-monitor";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { useBotRunner } from "@/context/bot-runner-context";

const search = z.object({
  preset: z.string().optional(),
});

export const Route = createFileRoute("/bot-builder")({
  component: BotBuilderPage,
  validateSearch: search,
  ssr: false,
});

function BotBuilderPage() {
  const { user } = useAuth();
  const { currency } = useDerivBalanceContext();
  const runner = useBotRunner();
  const [activeTab, setActiveTab] = useState("summary");
  const [monitorCollapsed, setMonitorCollapsed] = useState(false);

  async function handleRun() {
    // Force-flush any pending workspace edits before starting so the latest
    // block values land in localStorage before resolveRunnableBotSettings reads.
    if (runner.status !== "running") {
      try {
        const workspace = getDerivWorkspace();
        const B = getBlocklyRuntime();
        if (workspace && B?.Xml) {
          persistWorkspaceSnapshot(user?.id, workspace);
        }
      } catch {
        // Non-fatal — runner falls back to whatever is already saved.
      }
      setActiveTab("summary");
    }
    await runner.startBot();
  }

  return (
    <TopShell showBotMonitor={false}>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <BotBuilder />
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          <BotRunMonitorPanel
            activeTab={activeTab}
            collapsed={monitorCollapsed}
            connecting={runner.connecting}
            currency={currency || "USD"}
            journal={runner.journal}
            onReset={runner.resetRunner}
            onRun={handleRun}
            onToggleCollapse={() => setMonitorCollapsed((v) => !v)}
            setActiveTab={setActiveTab}
            stats={runner.stats}
            status={runner.status}
            transactions={runner.transactions}
          />
        </div>
      </div>
    </TopShell>
  );
}
