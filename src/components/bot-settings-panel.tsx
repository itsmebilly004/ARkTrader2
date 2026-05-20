import { useEffect, useState } from "react";
import { Info, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  initialBotBuilderSettings,
  persistUserBotOverrides,
  readCurrentBotSettings,
  readUserBotOverrides,
  type UserBotOverrides,
} from "@/lib/bot-builder-state";

type Props = {
  userId?: string | null;
};

function clamp(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function fieldClass(highlighted: boolean) {
  return cn(
    "w-full rounded-[3px] border px-2 py-1.5 text-sm tabular-nums outline-none transition",
    "border-[#d6d6d6] bg-white text-[#333] placeholder-[#aaa]",
    "focus:border-[#4bb4b3] focus:ring-1 focus:ring-[#4bb4b3]",
    "dark:border-[#2b2b2b] dark:bg-[#101010] dark:text-[#eee] dark:placeholder-[#555]",
    "dark:focus:border-[#4bb4b3]",
    highlighted && "border-[#4bb4b3] dark:border-[#4bb4b3]",
  );
}

export function BotSettingsPanel({ userId }: Props) {
  const [saved, setSaved] = useState(false);

  function loadValues() {
    const base = readCurrentBotSettings(userId) ?? initialBotBuilderSettings;
    const overrides = readUserBotOverrides(userId) ?? {};
    return {
      stake: String(overrides.stake ?? base.stake),
      martingale: String(overrides.martingale ?? base.martingale),
      maxStake: String(overrides.maxStake ?? base.maxStake),
      stopLoss: String(overrides.stopLoss ?? base.stopLoss),
      takeProfit: String(overrides.takeProfit ?? base.takeProfit),
      maxRuns: String(overrides.maxRuns ?? base.maxRuns),
    };
  }

  const [values, setValues] = useState(loadValues);

  useEffect(() => {
    setValues(loadValues());
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function handleChange(field: keyof UserBotOverrides, raw: string) {
    setValues((prev) => ({ ...prev, [field]: raw }));
    setSaved(false);

    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;

    let clamped = n;
    if (field === "stake") clamped = clamp(n, 0.35, 50000);
    if (field === "martingale") clamped = clamp(n, 1, 100);
    if (field === "maxStake") clamped = clamp(n, 0.35, 50000);
    if (field === "stopLoss") clamped = clamp(n, 0, 1_000_000);
    if (field === "takeProfit") clamped = clamp(n, 0, 1_000_000);
    if (field === "maxRuns") clamped = clamp(Math.round(n), 1, 1_000_000);

    const current = readUserBotOverrides(userId) ?? {};
    persistUserBotOverrides(userId, { ...current, [field]: clamped });
    setSaved(true);
  }

  const rows: Array<{
    field: keyof UserBotOverrides;
    label: string;
    hint: string;
    step: string;
    min: string;
  }> = [
    { field: "stake", label: "Initial stake", hint: "Amount per trade", step: "0.01", min: "0.35" },
    { field: "martingale", label: "Martingale", hint: "Multiply stake after a loss (1 = off)", step: "0.01", min: "1" },
    { field: "maxStake", label: "Max stake", hint: "Upper limit per trade", step: "0.01", min: "0.35" },
    { field: "stopLoss", label: "Stop loss", hint: "Stop when total loss reaches this (0 = off)", step: "0.01", min: "0" },
    { field: "takeProfit", label: "Take profit", hint: "Stop when total profit reaches this (0 = off)", step: "0.01", min: "0" },
    { field: "maxRuns", label: "Max runs", hint: "Maximum number of trades in a session", step: "1", min: "1" },
  ];

  const overrides = readUserBotOverrides(userId) ?? {};

  return (
    <div className="border-b border-[#e5e5e5] bg-white px-4 py-3 dark:border-[#2b2b2b] dark:bg-[#151515]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#555] dark:text-[#b7b7b7]">
          Bot Parameters
        </span>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-[#4bb4b3]">
            <Save className="size-3" /> Auto-saved
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map(({ field, label, hint, step, min }) => (
          <div key={field} className="min-w-0">
            <label className="mb-0.5 block text-[11px] font-medium text-[#444] dark:text-[#ccc]">
              {label}
            </label>
            <input
              type="number"
              className={fieldClass(overrides[field] !== undefined)}
              value={values[field]}
              step={step}
              min={min}
              onChange={(e) => handleChange(field, e.target.value)}
              aria-label={label}
              title={hint}
            />
          </div>
        ))}
      </div>

      <p className="mt-2 flex items-start gap-1 text-[10px] text-[#888] dark:text-[#666]">
        <Info className="mt-0.5 size-3 shrink-0" />
        Changes are auto-saved and used on the next bot run. These values override the Blockly
        workspace.
      </p>
    </div>
  );
}
