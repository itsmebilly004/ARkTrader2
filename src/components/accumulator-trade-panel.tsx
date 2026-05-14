import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { updateTrackedTrade, upsertTrackedTrade } from "@/lib/activity-memory";
import { isDemoAccount } from "@/lib/deriv-account";
import {
  buildOAuthUrl,
  ensureDerivTradingConnection,
  getDerivTradingErrorMessage,
  getTradingSocketAccountId,
  onStatus,
  redirectToDerivOAuth,
  sanitizeDerivOAuthUrl,
} from "@/lib/deriv";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCUMULATOR_GROWTH_RATES,
  EMPTY_ACCUMULATOR_CONTRACT,
  buildAccumulatorProposalPayload,
  normalizeAccumulatorContract,
  type AccumulatorContractState,
} from "@/lib/accumulator-engine";
import {
  buyProposal,
  requestProposal,
  sellContract,
  subscribeOpenContract,
} from "@/lib/deriv-trading-service";
import { cn } from "@/lib/utils";

type BarrierUpdate = {
  entry: number | null;
  high: number | null;
  low: number | null;
  breached?: boolean;
  profit?: number | null;
  profitCurrency?: string;
  profitStatus?: "active" | "lost" | "sold" | null;
};

type Props = {
  lastPrice?: number | null;
  market: string;
  onBarriers?: (barriers: BarrierUpdate) => void;
  onMarketChange?: (market: string) => void;
};

export function AccumulatorTradePanel({ lastPrice, market, onBarriers, onMarketChange }: Props) {
  const { user } = useAuth();
  const { account, balance: accountBalance, currency, refreshBalances } = useDerivBalanceContext();
  const token = account?.deriv_token ?? null;
  const tradeCurrency = currency || account?.currency || "";
  const selectedAccountIsDemo = account ? isDemoAccount(account) : false;

  const [stake, setStake] = useState(10);
  const [growthRate, setGrowthRate] = useState<number>(0.03);
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(false);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<AccumulatorContractState>(EMPTY_ACCUMULATOR_CONTRACT);
  const unsubscribeRef = useRef<null | (() => Promise<void>)>(null);
  const activeAccountIdRef = useRef<string | null>(null);
  const buyInFlightRef = useRef(false);
  const closedRef = useRef(false);
  const tradeIdRef = useRef<string | null>(null);
  const previewConfigRef = useRef(`${market}:${growthRate.toFixed(2)}`);
  const [previewEntrySpot, setPreviewEntrySpot] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      void unsubscribeRef.current?.();
    };
  }, []);

  useEffect(() => {
    const nextConfigKey = `${market}:${growthRate.toFixed(2)}`;
    if (previewConfigRef.current === nextConfigKey) return;
    previewConfigRef.current = nextConfigKey;
    if (state.status === "active" || state.status === "lost" || state.status === "sold") return;
    setPreviewEntrySpot(lastPrice ?? null);
  }, [growthRate, lastPrice, market, state.status]);

  useEffect(() => {
    if (state.status === "active") {
      setPreviewEntrySpot(null);
      return;
    }
    if (previewEntrySpot == null && lastPrice != null) {
      setPreviewEntrySpot(lastPrice);
    }
  }, [lastPrice, previewEntrySpot, state.status]);

  useEffect(() => {
    const finalStatuses = ["sold", "lost", "error"];
    if (!finalStatuses.includes(state.status)) return;
    const resetTimer = window.setTimeout(() => {
      setState(EMPTY_ACCUMULATOR_CONTRACT);
      activeAccountIdRef.current = null;
      tradeIdRef.current = null;
      closedRef.current = false;
      if (account) {
        void refreshBalances("post-accumulator-reset").catch((error) => {
          console.warn("[Accumulator] balance refresh after trade close failed", error);
        });
      }
    }, 3500);
    return () => window.clearTimeout(resetTimer);
  }, [account, refreshBalances, state.status]);

  useEffect(() => {
    const off = onStatus((socketStatus) => {
      if (socketStatus !== "disconnected") return;
      void cleanupSubscription();
      setState((current) =>
        current.status === "active"
          ? {
              ...current,
              status: "error",
              error: "Deriv WebSocket disconnected. Please reconnect before trading again.",
              isValidToSell: false,
            }
          : current,
      );
    });
    return off;
  }, []);

  useEffect(() => {
    const liveContract =
      state.status === "active" || state.status === "lost" || state.status === "sold";
    const referenceSpot = liveContract
      ? (state.entrySpot ?? state.currentSpot ?? lastPrice ?? null)
      : (previewEntrySpot ?? lastPrice ?? null);
    const fallback = estimateAccumulatorBarriers(referenceSpot, growthRate);
    const high = state.upperBarrier ?? fallback.high;
    const low = state.lowerBarrier ?? fallback.low;
    const currentSpot = liveContract
      ? (state.currentSpot ?? state.entrySpot ?? lastPrice ?? null)
      : (lastPrice ?? referenceSpot);
    const outsideRange =
      currentSpot != null &&
      high != null &&
      low != null &&
      (currentSpot >= high || currentSpot <= low);
    const profitStatus: BarrierUpdate["profitStatus"] =
      state.status === "active" || state.status === "lost" || state.status === "sold"
        ? state.status
        : null;
    onBarriers?.({
      entry: referenceSpot,
      high,
      low,
      breached: liveContract ? state.barrierBreached || outsideRange : outsideRange,
      profit:
        profitStatus === "active"
          ? (state.currentProfit ?? 0)
          : profitStatus === "lost"
            ? (state.currentProfit ?? -stake)
            : null,
      profitCurrency: tradeCurrency,
      profitStatus,
    });
  }, [
    growthRate,
    lastPrice,
    onBarriers,
    stake,
    state.barrierBreached,
    state.currentProfit,
    state.currentSpot,
    state.entrySpot,
    state.lowerBarrier,
    previewEntrySpot,
    state.status,
    state.upperBarrier,
    tradeCurrency,
  ]);

  useEffect(() => {
    if (!state.contractId || state.status !== "active") return;
    const currentSocketAccount = getTradingSocketAccountId();
    const selectedAccountId = account?.account_id ?? null;
    const activeAccountId = activeAccountIdRef.current;
    if (
      (currentSocketAccount && selectedAccountId && currentSocketAccount !== selectedAccountId) ||
      (activeAccountId && selectedAccountId && activeAccountId !== selectedAccountId)
    ) {
      setState((current) => ({
        ...current,
        status: "error",
        error: "Deriv WebSocket account changed. Reconnect the selected account.",
      }));
      void cleanupSubscription();
    }
  }, [account?.account_id, state.contractId, state.status]);

  async function cleanupSubscription() {
    const unsubscribe = unsubscribeRef.current;
    unsubscribeRef.current = null;
    if (unsubscribe) await unsubscribe();
  }

  function validateAccount() {
    if (!user) throw new Error("Sign in to place trades.");
    if (!token || !account) throw new Error("Connect and select your Deriv account first.");
    if (!tradeCurrency) throw new Error("Selected account currency is missing.");
    if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");
    if (accountBalance !== null && accountBalance < stake) {
      throw new Error(
        `Insufficient balance: ${accountBalance.toFixed(2)} ${tradeCurrency} available.`,
      );
    }
    if (account.normalizedType !== "demo" && account.normalizedType !== "real") {
      throw new Error("Selected Deriv account type could not be verified from its prefix.");
    }
    if (selectedAccountIsDemo !== Boolean(account.is_demo)) {
      console.info("[Accumulator] Account classification corrected", {
        account_id: account.account_id,
        loginid: account.loginid,
        detected_prefix: account.detected_prefix,
        normalizedType: account.normalizedType,
        final_tab_placement: account.final_tab_placement,
        stored_is_demo: account.is_demo,
        normalized_is_demo: selectedAccountIsDemo,
      });
    }
  }

  async function markTradeClosed(nextState: AccumulatorContractState) {
    const currentTradeId = tradeIdRef.current;
    if (!currentTradeId || closedRef.current) return;
    if (nextState.status !== "sold" && nextState.status !== "lost") return;
    closedRef.current = true;
    const profit = Number(nextState.currentProfit ?? 0);
    updateTrackedTrade(user?.id, nextState.contractId ?? "", {
      closedAt: new Date().toISOString(),
      payout: nextState.currentPayout ?? null,
      profitLoss: profit,
      status: nextState.status,
    });
    const { error } = await supabase
      .from("trades")
      .update({
        profit_loss: profit,
        status: profit >= 0 && nextState.status === "sold" ? "won" : "lost",
        closed_at: new Date().toISOString(),
      })
      .eq("id", currentTradeId);
    if (error) console.error("[Accumulator] Could not update closed trade", error);
  }

  async function startAccumulator() {
    if (buyInFlightRef.current || busy || state.status === "active") return;
    buyInFlightRef.current = true;
    setBusy(true);
    setState({ ...EMPTY_ACCUMULATOR_CONTRACT, status: "proposing" });
    closedRef.current = false;
    try {
      validateAccount();
      if (!account || !token) throw new Error("Connect and select your Deriv account first.");
      const tradingSession = await ensureDerivTradingConnection(account, {
        context: "accumulator-buy",
      });
      console.info("[Accumulator] Trading session prepared", {
        selectedAccountId: account.account_id,
        selectedLoginId: account.loginid,
        normalizedType: account.normalizedType,
        sessionAccountId: tradingSession.sessionAccountId,
        tokenExists: Boolean(tradingSession.token),
        tokenExpiry: tradingSession.expiresAt,
        tokenSource: tradingSession.tokenSource,
        adapter: tradingSession.adapter,
        websocketMode: tradingSession.websocketMode,
      });
      await cleanupSubscription();

      const payload = buildAccumulatorProposalPayload(
        {
          currency: tradeCurrency,
          growthRate,
          market,
          stake,
          takeProfit: takeProfitEnabled ? takeProfit : null,
        },
        tradingSession.adapter,
      );
      const proposalResponse = await requestProposal(payload, {
        adapter: tradingSession.adapter,
        selectedAccountId: tradingSession.account_id,
        selectedAccountType: tradingSession.normalizedType,
        contractType: payload.contract_type,
      });
      const proposalId = String(proposalResponse.proposal?.id ?? "");
      const askPrice = Number(proposalResponse.proposal?.ask_price ?? stake);
      setState((current) => ({ ...current, proposalId }));

      const buyResponse = await buyProposal(proposalId, askPrice, {
        adapter: tradingSession.adapter,
        selectedAccountId: tradingSession.account_id,
        selectedAccountType: tradingSession.normalizedType,
        contractType: payload.contract_type,
      });
      const contract = buyResponse.buy ?? {};
      const contractId = String(contract.contract_id ?? "");
      console.info("[Accumulator] contract_id", contractId);
      activeAccountIdRef.current = tradingSession.account_id;

      const { data: trade, error: tradeInsertError } = await supabase
        .from("trades")
        .insert({
          user_id: user!.id,
          deriv_contract_id: contractId,
          symbol: market,
          trade_type: payload.contract_type,
          stake,
          payout: Number(contract.payout ?? askPrice),
          status: "open",
        })
        .select()
        .single();
      if (tradeInsertError) {
        console.error("[Accumulator] Could not save trade history", tradeInsertError);
        toast.error("Trade placed, but history could not be saved.");
      }
      tradeIdRef.current = trade?.id ?? null;
      upsertTrackedTrade(user?.id, {
        contractId,
        contractType: payload.contract_type,
        currency: tradeCurrency,
        id: trade?.id ?? `accumulator-${contractId}`,
        market,
        openedAt: new Date().toISOString(),
        payout: Number(contract.payout ?? askPrice),
        profitLoss: 0,
        source: "accumulator",
        stake,
        status: "open",
      });

      setState((current) => ({
        ...current,
        contractId,
        buyPrice: Number(contract.buy_price ?? askPrice),
        currentPayout: Number(contract.payout ?? askPrice),
        currentProfit: 0,
        status: "active",
      }));

      unsubscribeRef.current = await subscribeOpenContract(contractId, (openContract) => {
        setState((current) => {
          const next = normalizeAccumulatorContract(openContract, current);
          console.info("[Accumulator] proposal_open_contract update", {
            contractId: next.contractId,
            currentSpot: next.currentSpot,
            entrySpot: next.entrySpot,
            upperBarrier: next.upperBarrier,
            lowerBarrier: next.lowerBarrier,
            payout: next.currentPayout,
            profit: next.currentProfit,
            sellPrice: next.sellPrice,
            isValidToSell: next.isValidToSell,
            status: next.status,
            barrierSource: next.barrierSource,
          });
          if ((next.status === "lost" || next.status === "sold") && current.status === "active") {
            void cleanupSubscription();
            void markTradeClosed(next);
            void refreshBalances("accumulator-closed").catch((error) => {
              console.warn("[Accumulator] balance refresh after close failed", error);
            });
          }
          return next;
        });
      });
      void refreshBalances("accumulator-placed").catch((error) => {
        console.warn("[Accumulator] balance refresh after buy failed", error);
      });
    } catch (error: unknown) {
      const message = getDerivTradingErrorMessage(error);
      console.error("[Accumulator] Trade failed", error);
      setState((current) => ({ ...current, status: "error", error: message }));
      toast.error(message);
    } finally {
      setBusy(false);
      buyInFlightRef.current = false;
    }
  }

  async function handleSell() {
    if (busy) return;
    if (!state.contractId) {
      toast.error("No active accumulator contract.");
      return;
    }
    if (!state.isValidToSell || state.sellPrice == null) {
      toast.error("No sell price available yet.");
      return;
    }
    setBusy(true);
    try {
      if (account) {
        await ensureDerivTradingConnection(account, { context: "accumulator-sell" });
      }
      const response = await sellContract(state.contractId, state.sellPrice);
      const sold = response.sell ?? {};
      const profit = Number(sold.profit ?? state.currentProfit ?? 0);
      const next: AccumulatorContractState = {
        ...state,
        currentProfit: profit,
        sellPrice: Number(sold.sold_for ?? sold.sell_price ?? state.sellPrice),
        status: "sold",
        isValidToSell: false,
      };
      setState(next);
      await cleanupSubscription();
      await markTradeClosed(next);
      void refreshBalances("accumulator-sell").catch((error) => {
        console.warn("[Accumulator] balance refresh after sell failed", error);
      });
    } catch (error: unknown) {
      const message = getDerivTradingErrorMessage(error);
      setState((current) => ({ ...current, status: "error", error: message }));
      console.error("[Accumulator] Sell failed", error);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const canSell = state.status === "active" && state.isValidToSell && state.sellPrice != null;

  return (
    <div className="flex flex-col gap-3 max-sm:gap-1.5">
      <div className="order-3 rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5 sm:order-none dark:border-[#2f3337] dark:bg-[#151515]">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-[#1f2328] max-sm:mb-1 max-sm:text-[11px] dark:text-[#f2f2f2]">
          <span>Growth rate</span>
          <span className="flex items-center gap-1 text-xs font-medium text-[#6f767d] max-sm:hidden dark:text-[#a8b0b8]">
            <Info className="h-3.5 w-3.5" />
            Risk scales with rate
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 max-sm:gap-0.5">
          {ACCUMULATOR_GROWTH_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => setGrowthRate(rate)}
              disabled={state.status === "active"}
              className={cn(
                "rounded border py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 max-sm:py-1 max-sm:text-[10px]",
                growthRate === rate
                  ? "border-[#ff444f] bg-[#fff1f2] text-[#cc2f39]"
                  : "border-[#d6d9dc] bg-white text-[#1f2328] hover:bg-[#f6f7f8] dark:border-[#30343a] dark:bg-[#101010] dark:text-[#f2f2f2] dark:hover:bg-[#202020]",
              )}
            >
              {Math.round(rate * 100)}%
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#6f767d] max-sm:hidden dark:text-[#a8b0b8]">
          Higher growth rates increase payout speed and tighten barrier tolerance.
        </p>
      </div>

      <div className="order-1 rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5 sm:order-none dark:border-[#2f3337] dark:bg-[#151515]">
        <div className="text-xs font-semibold uppercase tracking-wide text-[#6f767d] max-sm:text-[9px] dark:text-[#a8b0b8]">
          Stake
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 max-sm:gap-1 sm:gap-2">
          <button
            onClick={() => setStake((value) => Math.max(1, +(value - 1).toFixed(2)))}
            disabled={state.status === "active"}
            className="shrink-0 rounded border border-[#d6d9dc] bg-white p-2 text-[#495057] hover:bg-[#f6f7f8] disabled:opacity-60 max-sm:p-1.5 dark:border-[#30343a] dark:bg-[#101010] dark:text-[#dce1e5] dark:hover:bg-[#202020]"
            aria-label="Decrease stake"
          >
            <Minus className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
          </button>
          <Input
            type="number"
            min={1}
            step={1}
            value={stake}
            disabled={state.status === "active"}
            onChange={(event) => setStake(Number(event.target.value))}
            className="h-10 min-w-0 rounded border-[#d6d9dc] text-center font-mono text-base font-semibold max-sm:h-7 max-sm:text-[11px] dark:border-[#30343a] dark:bg-[#101010] dark:text-[#f2f2f2]"
          />
          <button
            onClick={() => setStake((value) => +(value + 1).toFixed(2))}
            disabled={state.status === "active"}
            className="shrink-0 rounded border border-[#d6d9dc] bg-white p-2 text-[#495057] hover:bg-[#f6f7f8] disabled:opacity-60 max-sm:p-1.5 dark:border-[#30343a] dark:bg-[#101010] dark:text-[#dce1e5] dark:hover:bg-[#202020]"
            aria-label="Increase stake"
          >
            <Plus className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
          </button>
          <span className="w-10 shrink-0 truncate text-center text-xs font-semibold text-[#495057] max-sm:w-8 max-sm:text-[9px] sm:w-14 dark:text-[#dce1e5]">
            {tradeCurrency}
          </span>
        </div>
      </div>

      <div className="order-4 rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-1.5 sm:order-none dark:border-[#2f3337] dark:bg-[#151515]">
        <label className="flex items-center justify-between text-sm max-sm:text-[11px]">
          <span className="flex items-center gap-2 font-semibold text-[#1f2328] dark:text-[#f2f2f2]">
            <input
              type="checkbox"
              checked={takeProfitEnabled}
              disabled={state.status === "active"}
              onChange={(event) => setTakeProfitEnabled(event.target.checked)}
              className="size-4 rounded border-[#d6d6d6]"
            />
            Take profit
          </span>
          <Info className="h-3.5 w-3.5 text-[#777777] dark:text-[#a8b0b8]" />
        </label>
        {takeProfitEnabled && (
          <Input
            type="number"
            min={0}
            step={1}
            value={takeProfit}
            disabled={state.status === "active"}
            onChange={(event) => setTakeProfit(Number(event.target.value))}
            className="mt-2 h-10 rounded border-[#d6d9dc] text-center font-mono font-semibold max-sm:mt-1 max-sm:h-7 max-sm:text-[11px] dark:border-[#30343a] dark:bg-[#101010] dark:text-[#f2f2f2]"
            placeholder={`Amount (${tradeCurrency})`}
          />
        )}
      </div>

      {state.error && (
        <div className="order-5 rounded-md border border-[#ffd1d4] bg-[#fff7f7] p-2 text-xs font-medium text-[#cc2f39] max-sm:text-[11px] sm:order-none dark:border-[#5b2227] dark:bg-[#2a1114] dark:text-[#ff8b92]">
          {state.error}
        </div>
      )}

      <Button
        onClick={() => {
          if (!token) {
            buildOAuthUrl({ returnTo: "/" })
              .then((url) => {
                console.log("Deriv OAuth URL:", sanitizeDerivOAuthUrl(url));
                redirectToDerivOAuth(url);
              })
              .catch((error) => {
                const message =
                  error instanceof Error ? error.message : "Could not start Deriv OAuth.";
                console.error("[Deriv OAuth] Accumulator connect failed", error);
                toast.error(message);
              });
            return;
          }
          if (state.status === "active") void handleSell();
          else void startAccumulator();
        }}
        disabled={busy || (state.status === "active" && !canSell)}
        className={cn(
          "order-2 h-12 w-full rounded-md text-base font-semibold text-white max-sm:h-8 max-sm:text-[11px] sm:order-none",
          state.status === "active"
            ? "bg-[#ff444f] hover:bg-[#eb3e48]"
            : "bg-[#13a883] hover:bg-[#119875]",
        )}
      >
        {busy
          ? state.status === "active"
            ? "Selling..."
            : "Buying..."
          : state.status === "active"
            ? canSell
              ? `Sell ${moneyLabel(state.sellPrice, tradeCurrency)}`
              : "Waiting for sell price"
            : token
              ? `Buy accumulator (${selectedAccountIsDemo ? "Demo" : "Live"})`
              : "Sign in & connect Deriv to trade"}
      </Button>
    </div>
  );
}

function moneyLabel(value?: number | null, currency?: string, signed = false) {
  if (value == null || !Number.isFinite(value)) return "-";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function estimateAccumulatorBarriers(spot: number | null | undefined, growthRate: number) {
  if (spot == null || !Number.isFinite(spot)) return { high: null, low: null };
  const ratioByGrowthRate: Record<string, number> = {
    "0.01": 0.00072,
    "0.02": 0.00052,
    "0.03": 0.00038,
    "0.04": 0.00031,
    "0.05": 0.00025,
  };
  const ratio = ratioByGrowthRate[growthRate.toFixed(2)] ?? 0.00038;
  const distance = Math.max(Math.abs(spot) * ratio, 0.0001);
  return {
    high: spot + distance,
    low: spot - distance,
  };
}
