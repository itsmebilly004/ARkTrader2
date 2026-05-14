import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { TradeTypeConfig } from "@/lib/trade-types";

export function TradeTypeCard({
  config,
  onNext,
  onPrevious,
}: {
  config: TradeTypeConfig;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <section className="rounded-md border border-[#d6d9dc] bg-white shadow-sm">
      <div className="border-b border-[#eceded] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6f767d] max-sm:px-2 max-sm:py-0.5 max-sm:text-[9px]">
        Contract type
      </div>
      <div className="flex items-center gap-2 px-2 py-2 max-sm:gap-1 max-sm:py-1">
        <NavButton label="Previous trade type" onClick={onPrevious}>
          <ChevronLeft className="size-4 max-sm:size-3.5" />
        </NavButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-[#eceded] bg-[#fafafa] px-2 py-2 max-sm:gap-1.5 max-sm:px-1.5 max-sm:py-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#ff444f] ring-1 ring-[#e5e5e5] max-sm:size-[22px] max-sm:text-[8px]">
            {config.icon}
          </span>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-semibold text-[#1f2328] max-sm:text-[11px]">
              {config.label}
            </div>
            <p className="truncate text-[11px] text-[#6f767d] max-sm:hidden">
              {config.description}
            </p>
          </div>
        </div>
        <NavButton label="Next trade type" onClick={onNext}>
          <ChevronRight className="size-4 max-sm:size-3.5" />
        </NavButton>
      </div>
    </section>
  );
}

export function TickDurationSelector({
  duration,
  durationUnit,
  onDurationChange,
  onUnitChange,
  showUnits,
}: {
  duration: number;
  durationUnit: "t" | "s" | "m";
  onDurationChange: (value: number) => void;
  onUnitChange: (value: "t" | "s" | "m") => void;
  showUnits: boolean;
}) {
  return (
    <section className="rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[#1f2328] max-sm:text-[11px]">Duration</div>
        <div className="rounded-full bg-[#f2f4f5] px-2 py-0.5 text-xs font-semibold text-[#495057] max-sm:px-1.5 max-sm:text-[9px]">
          {durationUnit === "t" ? "Ticks" : durationUnit === "s" ? "Seconds" : "Minutes"}
        </div>
      </div>
      <Slider className="mt-3 max-sm:mt-1.5" min={1} max={10} step={1} value={[duration]} onValueChange={(value) => onDurationChange(value[0])} />
      <div className="mt-2 text-center font-mono text-sm font-semibold text-[#1f2328] max-sm:mt-1 max-sm:text-[11px]">
        {duration} {durationUnit === "t" ? `Tick${duration === 1 ? "" : "s"}` : durationUnit}
      </div>
      {showUnits && (
        <div className="mt-2 grid grid-cols-3 gap-1 max-sm:mt-1">
          {(["t", "s", "m"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => onUnitChange(unit)}
              className={cn(
                "rounded border px-2 py-1 text-xs font-semibold transition max-sm:px-1 max-sm:py-0.5 max-sm:text-[9px]",
                durationUnit === unit
                  ? "border-[#ff444f] bg-[#fff1f2] text-[#cc2f39]"
                  : "border-[#e1e4e8] bg-white text-[#495057] hover:bg-[#f6f7f8]",
              )}
            >
              {unit === "t" ? "Ticks" : unit === "s" ? "Sec" : "Min"}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function DigitSelector({
  currentDigit,
  mode,
  selectedDigit,
  onDigitChange,
}: {
  currentDigit: number | null;
  mode: "barrier" | "prediction";
  selectedDigit: number;
  onDigitChange: (digit: number) => void;
}) {
  return (
    <section className="rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5">
      <div className="mb-2 flex items-center justify-between gap-3 max-sm:mb-1">
        <div className="text-sm font-semibold text-[#1f2328] max-sm:text-[11px]">
          {mode === "barrier" ? "Last digit barrier" : "Last digit prediction"}
        </div>
        <span className="rounded border border-[#ffd4d8] bg-[#fff1f2] px-2 py-0.5 text-xs font-bold text-[#cc2f39] max-sm:px-1.5 max-sm:text-[9px]">
          {currentDigit ?? "-"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 max-sm:grid-cols-10 max-sm:gap-0.5">
        {Array.from({ length: 10 }, (_, digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => onDigitChange(digit)}
            className={cn(
              "h-9 rounded border text-sm font-semibold transition max-sm:h-[26px] max-sm:text-[10px]",
              selectedDigit === digit
                ? "border-[#ff444f] bg-[#ff444f] text-white"
                : "border-[#d6d9dc] bg-white text-[#1f2328] hover:bg-[#f6f7f8]",
            )}
          >
            {digit}
          </button>
        ))}
      </div>
    </section>
  );
}

export function StakePayoutToggle({
  currency,
  mode,
  onModeChange,
  onStakeChange,
  stake,
}: {
  currency: string;
  mode: "stake" | "payout";
  onModeChange: (mode: "stake" | "payout") => void;
  onStakeChange: (value: number) => void;
  stake: number;
}) {
  return (
    <section className="rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5">
      <div className="grid grid-cols-2 rounded-md border border-[#d6d9dc] bg-[#f8f9fa] p-1 max-sm:p-0.5">
        {(["stake", "payout"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onModeChange(item)}
            className={cn(
              "rounded px-2 py-1.5 text-sm font-semibold capitalize transition max-sm:px-1 max-sm:py-0.5 max-sm:text-[10px]",
              mode === item
                ? "bg-white text-[#1f2328] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-[#6f767d] hover:text-[#343a40]",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#6f767d] max-sm:mt-1 max-sm:text-[9px]">
        {mode === "stake" ? "Stake amount" : "Payout target"}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 max-sm:gap-1">
        <StepperButton
          icon={Minus}
          label="Decrease amount"
          onClick={() => onStakeChange(Math.max(0.35, +(stake - 1).toFixed(2)))}
        />
        <Input
          type="number"
          min={0.35}
          step={1}
          value={stake}
          onChange={(event) => onStakeChange(Number(event.target.value))}
          className="h-10 min-w-0 rounded border-[#d6d9dc] text-center font-mono text-base font-semibold max-sm:h-7 max-sm:text-[11px]"
        />
        <StepperButton icon={Plus} label="Increase amount" onClick={() => onStakeChange(+(stake + 1).toFixed(2))} />
        <span className="w-12 shrink-0 truncate text-center text-xs font-semibold text-[#495057] max-sm:w-8 max-sm:text-[9px]">
          {currency}
        </span>
      </div>
    </section>
  );
}

export function ProposalButton({
  disabled,
  label,
  loading,
  onClick,
  payout,
  pct,
  tone,
}: {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onClick: () => void;
  payout?: string;
  pct?: string;
  tone: "up" | "down";
}) {
  const toneStyles =
    tone === "up"
      ? {
          body: "bg-[#13a883] hover:bg-[#119875]",
          head: "bg-[#109070]",
          Icon: ArrowUpRight,
          accent: "text-[#d9fff4]",
        }
      : {
          body: "bg-[#ff444f] hover:bg-[#e33c47]",
          head: "bg-[#e33c47]",
          Icon: ArrowDownRight,
          accent: "text-[#ffe0e2]",
        };
  const ToneIcon = toneStyles.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full overflow-hidden rounded-md text-left text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
        toneStyles.body,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-3 py-1.5 text-xs max-sm:px-2 max-sm:py-1 max-sm:text-[10px]",
          toneStyles.head,
        )}
      >
        <span className="font-medium">Payout {payout ?? "-"}</span>
        <span className={cn("font-mono font-semibold", toneStyles.accent)}>{pct ?? ""}</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 max-sm:px-2 max-sm:py-[5px]">
        <span className="truncate text-sm font-semibold max-sm:text-[11px]">
          {loading ? "Loading quote..." : label}
        </span>
        <ToneIcon className="size-5 shrink-0 max-sm:size-3.5" />
      </div>
    </button>
  );
}

export function ProposalSummary({
  rows,
}: {
  rows: Array<[string, string | number | null | undefined]>;
}) {
  return (
    <section className="rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5">
      <div className="mb-2 text-sm font-semibold text-[#1f2328] max-sm:mb-1 max-sm:text-[11px]">
        Open contract
      </div>
      <div className="grid grid-cols-2 gap-2 max-sm:gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded border border-[#edf0f2] bg-[#fafbfc] px-2 py-1.5 max-sm:px-1.5 max-sm:py-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7a838c] max-sm:text-[8px]">
              {label}
            </div>
            <div className="mt-0.5 truncate font-mono text-xs font-semibold text-[#1f2328] max-sm:text-[10px]">
              {value ?? "-"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StepperButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded border border-[#d6d9dc] bg-white p-2 text-[#495057] hover:bg-[#f6f7f8] max-sm:p-1"
      aria-label={label}
    >
      <Icon className="size-4 max-sm:size-3" />
    </button>
  );
}

function NavButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded border border-[#d6d9dc] bg-white text-[#495057] transition hover:bg-[#f6f7f8] max-sm:size-6"
      aria-label={label}
    >
      {children}
    </button>
  );
}
