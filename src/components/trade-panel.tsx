import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccumulatorTradePanel } from "@/components/accumulator-trade-panel";
import { MarketSelector } from "@/components/market-selector";
import {
  DigitSelector,
  ProposalButton,
  ProposalSummary,
  StakePayoutToggle,
  TickDurationSelector,
  TradeTypeCard,
} from "@/components/trade-option-components";
import { useAuth } from "@/hooks/use-auth";
import { useDerivBalanceContext } from "@/context/deriv-balance-context";
import { updateTrackedTrade, upsertTrackedTrade } from "@/lib/activity-memory";
import {
  ensureDerivTradingConnection,
  getDerivTradingErrorMessage,
  getTradingSocketAccountId,
  type TradeCategory,
  type TradingAdapter,
} from "@/lib/deriv";
import {
  normalizeOpenContract,
  EMPTY_CONTRACT_STATE,
  type ActiveContractState,
} from "@/lib/contract-state";
import { buildStandardProposalPayload, type ProposalInput } from "@/lib/trade-proposal-builder";
import {
  isDigitTrade,
  tradeTypeConfig,
  TRADE_TYPE_CONFIGS,
  type TradeSide,
} from "@/lib/trade-types";
import {
  buyProposal,
  requestProposal,
  sellContract,
  subscribeOpenContract,
} from "@/lib/deriv-trading-service";
import { supabase } from "@/integrations/supabase/client";

type ChartOverlay = {
  entry: number | null;
  high: number | null;
  low: number | null;
  breached?: boolean;
  profit?: number | null;
  profitCurrency?: string;
  profitStatus?: "active" | "lost" | "sold" | null;
};

type ProposalQuote = {
  askPrice: number | null;
  error: string | null;
  id: string | null;
  payout: number | null;
  pct: number | null;
};


interface TradePanelProps {
  market: string;
  lastPrice?: number | null;
  onAccumulatorBarriers?: (b: ChartOverlay) => void;
  onMarketChange?: (market: string) => void;
  onTradeTypeChange?: (tradeType: TradeCategory) => void;
  showMarketSelector?: boolean;
}

const EMPTY_QUOTE: ProposalQuote = {
  askPrice: null,
  error: null,
  id: null,
  payout: null,
  pct: null,
};


export function TradePanel({
  market,
  lastPrice,
  onAccumulatorBarriers,
  onMarketChange,
  onTradeTypeChange,
  showMarketSelector = true,
}: TradePanelProps) {
  const { user } = useAuth();
  const { account, balance: accountBalance, currency, refreshBalances } = useDerivBalanceContext();
  const token = account?.deriv_token ?? null;
  const tradeCurrency = currency || account?.currency || "";

  const [selectedTradeType, setSelectedTradeType] = useState<TradeCategory>("accumulator");
  const [selectedSide, setSelectedSide] = useState("buy");
  const [stake, setStake] = useState(10);
  const [payoutMode, setPayoutMode] = useState<"stake" | "payout">("stake");
  const [duration, setDuration] = useState(5);
  const [durationUnit, setDurationUnit] = useState<"t" | "s" | "m">("t");
  const [barrier, setBarrier] = useState("+0.10");
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [multiplier, setMultiplier] = useState(100);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [quotes, setQuotes] = useState<Record<string, ProposalQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeContract, setActiveContract] = useState<ActiveContractState>(EMPTY_CONTRACT_STATE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quotesVersion, setQuotesVersion] = useState(0);

  const unsubscribeRef = useRef<null | (() => Promise<void>)>(null);
  const buyInFlightRef = useRef(false);
  const tradeIdRef = useRef<string | null>(null);
  const activeAccountIdRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  const config = tradeTypeConfig(selectedTradeType);
  const currentDigit =
    lastPrice != null && Number.isFinite(lastPrice) ? Number(lastPrice.toFixed(2).slice(-1)) : null;

  useEffect(() => {
    setSelectedSide(tradeTypeConfig(selectedTradeType).sides[0]?.value ?? "up");
    setActiveContract(EMPTY_CONTRACT_STATE);
    setErrorMessage(null);
    onTradeTypeChange?.(selectedTradeType);
  }, [onTradeTypeChange, selectedTradeType]);

  useEffect(() => {
    return () => {
      void cleanupSubscription();
    };
  }, []);


  useEffect(() => {
    if (selectedTradeType === "accumulator") return;
    if (activeContract.status === "active") {
      onAccumulatorBarriers?.({
        entry: activeContract.entrySpot,
        high: config.needsBarrier
          ? barrierLineFromInput(barrier, activeContract.entrySpot ?? lastPrice)
          : null,
        low: null,
        breached: false,
      });
      return;
    }
    onAccumulatorBarriers?.({
      entry: null,
      high: config.needsBarrier ? barrierLineFromInput(barrier, lastPrice) : null,
      low: null,
      breached: false,
    });
  }, [
    activeContract.entrySpot,
    activeContract.status,
    barrier,
    config.needsBarrier,
    lastPrice,
    onAccumulatorBarriers,
    selectedTradeType,
  ]);

  useEffect(() => {
    if (selectedTradeType === "accumulator") {
      setQuotes({});
      return;
    }
    if (!account || !tradeCurrency) {
      setQuotes({});
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setQuotesLoading(true);
      const next: Record<string, ProposalQuote> = {};
      try {
        const tradingSession = await ensureDerivTradingConnection(account, {
          context: "proposal-quotes",
        });
        console.info("[Deriv Trade] Proposal trading session prepared", {
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
        await Promise.all(
          config.sides.map(async (side) => {
            try {
              const payload = buildPayload(side.value, payoutMode, tradingSession.adapter);
              const response = await requestProposal(payload, {
                adapter: tradingSession.adapter,
                selectedAccountId: tradingSession.account_id,
                selectedAccountType: tradingSession.normalizedType,
                contractType: payload.contract_type,
              });
              const proposal = response.proposal ?? {};
              const payout = numberFrom(proposal.payout);
              const askPrice = numberFrom(proposal.ask_price) ?? stake;
              next[side.value] = {
                askPrice,
                error: null,
                id: String(proposal.id ?? ""),
                payout,
                pct: payout != null && askPrice > 0 ? ((payout - askPrice) / askPrice) * 100 : null,
              };
            } catch (error) {
              next[side.value] = {
                ...EMPTY_QUOTE,
                error: getDerivTradingErrorMessage(error) || "Proposal unavailable",
              };
            }
          }),
        );
      } catch (error) {
        const message = getDerivTradingErrorMessage(error);
        for (const side of config.sides) {
          next[side.value] = {
            ...EMPTY_QUOTE,
            error: message || "Proposal unavailable",
          };
        }
      }
      if (!cancelled) {
        setQuotes(next);
        setQuotesLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    account?.account_id,
    barrier,
    config.sides,
    duration,
    durationUnit,
    market,
    multiplier,
    payoutMode,
    quotesVersion,
    selectedDigit,
    selectedTradeType,
    stake,
    stopLoss,
    takeProfit,
    tradeCurrency,
  ]);

  useEffect(() => {
    const finalStatuses = ["won", "lost", "sold", "error"];
    if (!finalStatuses.includes(activeContract.status)) return;
    if (selectedTradeType === "accumulator") return;
    const resetTimer = window.setTimeout(() => {
      setActiveContract(EMPTY_CONTRACT_STATE);
      setErrorMessage(null);
      setSelectedSide(tradeTypeConfig(selectedTradeType).sides[0]?.value ?? "up");
      setQuotesVersion((value) => value + 1);
      tradeIdRef.current = null;
      activeAccountIdRef.current = null;
      closedRef.current = false;
      if (account) {
        void refreshBalances("post-trade-reset").catch((error) => {
          console.warn("[Manual Trader] balance refresh after trade close failed", error);
        });
      }
    }, 3500);
    return () => window.clearTimeout(resetTimer);
  }, [account, activeContract.status, refreshBalances, selectedTradeType]);

  useEffect(() => {
    const selectedAccountId = account?.account_id ?? null;
    if (
      activeContract.status === "active" &&
      activeAccountIdRef.current &&
      selectedAccountId &&
      activeAccountIdRef.current !== selectedAccountId
    ) {
      setActiveContract((current) => ({
        ...current,
        error: "Selected Deriv account changed. Reconnect before trading again.",
        isValidToSell: false,
        status: "error",
      }));
      void cleanupSubscription();
    }
  }, [account?.account_id, activeContract.status]);

  function buildPayload(
    side: string,
    basis: "stake" | "payout" = "stake",
    adapter: TradingAdapter = "oauth2PkceTradingAdapter",
  ) {
    const input: ProposalInput = {
      barrier,
      currency: tradeCurrency,
      duration,
      durationUnit,
      market,
      multiplier,
      payoutMode: basis,
      selectedDigit,
      side,
      stake,
      stopLoss,
      takeProfit,
      tradeType: selectedTradeType,
    };
    return buildStandardProposalPayload(input, adapter);
  }

  function validateAccount() {
    if (!user) throw new Error("Sign in to place trades.");
    if (!account) throw new Error("No account selected.");
    if (!tradeCurrency) throw new Error("Selected account currency is missing.");
    if (!Number.isFinite(stake) || stake <= 0) throw new Error("Enter a valid stake.");
    if (accountBalance !== null && accountBalance < stake) {
      throw new Error(
        `Insufficient balance: ${accountBalance.toFixed(2)} ${tradeCurrency} available.`,
      );
    }
  }

  async function cleanupSubscription() {
    const unsubscribe = unsubscribeRef.current;
    unsubscribeRef.current = null;
    if (unsubscribe) await unsubscribe();
  }

  async function markTradeClosed(nextState: ActiveContractState) {
    const tradeId = tradeIdRef.current;
    if (!tradeId || closedRef.current) return;
    if (!["sold", "won", "lost"].includes(nextState.status)) return;
    closedRef.current = true;
    const profit = Number(nextState.currentProfit ?? 0);
    updateTrackedTrade(user?.id, nextState.contractId ?? "", {
      closedAt: new Date().toISOString(),
      payout: nextState.payout ?? null,
      profitLoss: profit,
      status:
        nextState.status === "won"
          ? "won"
          : nextState.status === "lost"
            ? "lost"
            : "sold",
    });
    const { error } = await supabase
      .from("trades")
      .update({
        profit_loss: profit,
        status: profit >= 0 && nextState.status !== "lost" ? "won" : "lost",
        closed_at: new Date().toISOString(),
      })
      .eq("id", tradeId);
    if (error) console.error("[Deriv Trade] Could not update closed trade", error);
  }

  async function handleBuy(side: TradeSide) {
    if (buyInFlightRef.current || busy) return;
    buyInFlightRef.current = true;
    setBusy(true);
    setErrorMessage(null);
    setSelectedSide(side.value);
    setActiveContract({ ...EMPTY_CONTRACT_STATE, status: "buying" });
    closedRef.current = false;
    try {
      validateAccount();
      if (!account || !user) throw new Error("No account selected.");
      const tradingSession = await ensureDerivTradingConnection(account, {
        context: "standard-buy",
      });
      console.info("[Deriv Trade] Trading session prepared", {
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

      const quote = quotes[side.value];
      let proposalId = quote?.id;
      let askPrice = quote?.askPrice ?? stake;
      const fallbackPayload = buildPayload(side.value, "stake", tradingSession.adapter);
      if (!proposalId) {
        const proposalResponse = await requestProposal(fallbackPayload, {
          adapter: tradingSession.adapter,
          selectedAccountId: tradingSession.account_id,
          selectedAccountType: tradingSession.normalizedType,
          contractType: fallbackPayload.contract_type,
        });
        const proposal = proposalResponse.proposal ?? {};
        proposalId = String(proposal.id ?? "");
        askPrice = numberFrom(proposal.ask_price) ?? stake;
      }
      if (!proposalId) throw new Error("No proposal id available.");

      const buyResponse = await buyProposal(proposalId, askPrice, {
        adapter: tradingSession.adapter,
        selectedAccountId: tradingSession.account_id,
        selectedAccountType: tradingSession.normalizedType,
        contractType: fallbackPayload.contract_type,
      });
      const buy = buyResponse.buy ?? {};
      const contractId = String(buy.contract_id ?? "");
      const contractType = String(buy.contract_type ?? fallbackPayload.contract_type);
      const { data: trade, error: insertError } = await supabase
        .from("trades")
        .insert({
          user_id: user.id,
          deriv_contract_id: contractId,
          symbol: market,
          trade_type: contractType,
          stake,
          payout: Number(buy.payout ?? quote?.payout ?? 0),
          status: "open",
        })
        .select()
        .single();
      if (insertError) {
        console.error("[Deriv Trade] Could not save trade", insertError);
        toast.error("Trade placed, but history could not be saved.");
      }
      tradeIdRef.current = trade?.id ?? null;
      activeAccountIdRef.current = tradingSession.account_id;
      upsertTrackedTrade(user.id, {
        contractId,
        contractType,
        currency: tradeCurrency,
        id: trade?.id ?? `manual-${contractId}`,
        market,
        openedAt: new Date().toISOString(),
        payout: Number(buy.payout ?? quote?.payout ?? 0),
        profitLoss: 0,
        source: "manual",
        stake,
        status: "open",
      });
      setActiveContract({
        ...EMPTY_CONTRACT_STATE,
        buyPrice: numberFrom(buy.buy_price) ?? askPrice,
        contractId,
        payout: numberFrom(buy.payout) ?? quote?.payout ?? null,
        status: "active",
      });
      unsubscribeRef.current = await subscribeOpenContract(contractId, (openContract) => {
        setActiveContract((current) => {
          const next = normalizeOpenContract(openContract, current);
          console.info("[Deriv Trade] proposal_open_contract update", {
            contractId: next.contractId,
            currentSpot: next.currentSpot,
            entrySpot: next.entrySpot,
            payout: next.payout,
            profit: next.currentProfit,
            sellPrice: next.sellPrice,
            isValidToSell: next.isValidToSell,
            status: next.status,
            websocketAccountId: getTradingSocketAccountId(),
          });
          if (["sold", "won", "lost"].includes(next.status) && current.status === "active") {
            void cleanupSubscription();
            void markTradeClosed(next);
            void refreshBalances("trade-closed").catch((error) => {
              console.warn("[Manual Trader] balance refresh after close failed", error);
            });
          }
          return next;
        });
      });
      setQuotesVersion((value) => value + 1);
      void refreshBalances("trade-placed").catch((error) => {
        console.warn("[Manual Trader] balance refresh after buy failed", error);
      });
    } catch (error) {
      const message = getDerivTradingErrorMessage(error);
      console.error("[Deriv Trade] Buy failed", error);
      setErrorMessage(message);
      setActiveContract((current) => ({ ...current, error: message, status: "error" }));
      toast.error(message);
    } finally {
      buyInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function handleSell() {
    if (
      !activeContract.contractId ||
      !activeContract.isValidToSell ||
      activeContract.sellPrice == null
    ) {
      toast.error("No sell price available for this contract.");
      return;
    }
    setBusy(true);
    try {
      if (account) {
        await ensureDerivTradingConnection(account, { context: "standard-sell" });
      }
      const response = await sellContract(activeContract.contractId, activeContract.sellPrice);
      const sold = response.sell ?? {};
      const profit = numberFrom(sold.profit) ?? activeContract.currentProfit ?? 0;
      const next: ActiveContractState = {
        ...activeContract,
        currentProfit: profit,
        isValidToSell: false,
        sellPrice: numberFrom(sold.sold_for, sold.sell_price) ?? activeContract.sellPrice,
        status: profit >= 0 ? "won" : "lost",
      };
      setActiveContract(next);
      await cleanupSubscription();
      await markTradeClosed(next);
      void refreshBalances("manual-sell").catch((error) => {
        console.warn("[Manual Trader] balance refresh after sell failed", error);
      });
    } catch (error) {
      const message = getDerivTradingErrorMessage(error);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const activeQuote = quotes[selectedSide];
  const tradeIndex = TRADE_TYPE_CONFIGS.findIndex((item) => item.category === selectedTradeType);
  const nextTradeType = useCallback(
    (direction: -1 | 1) => {
      const next = (tradeIndex + direction + TRADE_TYPE_CONFIGS.length) % TRADE_TYPE_CONFIGS.length;
      setSelectedTradeType(TRADE_TYPE_CONFIGS[next].category);
    },
    [tradeIndex],
  );

  const activeRows = useMemo<[string, string | number | null | undefined][]>(
    () => [
      ["Status", activeContract.status],
      ["Contract", activeContract.contractId],
      ["Entry", numberLabel(activeContract.entrySpot)],
      ["Current", numberLabel(activeContract.currentSpot ?? lastPrice)],
      ["Buy price", moneyLabel(activeContract.buyPrice, tradeCurrency)],
      ["Payout", moneyLabel(activeContract.payout, tradeCurrency)],
      ["P/L", moneyLabel(activeContract.currentProfit, tradeCurrency, true)],
      ["Sell price", moneyLabel(activeContract.sellPrice, tradeCurrency)],
    ],
    [activeContract, lastPrice, tradeCurrency],
  );

  if (selectedTradeType === "accumulator") {
    return (
      <div className="min-w-0 space-y-2 max-sm:space-y-1.5">
        {showMarketSelector && onMarketChange && (
          <MarketSelector value={market} onValueChange={onMarketChange} />
        )}
        <TradeTypeCard
          config={config}
          onNext={() => nextTradeType(1)}
          onPrevious={() => nextTradeType(-1)}
        />
        <AccumulatorTradePanel
          lastPrice={lastPrice}
          market={market}
          onBarriers={onAccumulatorBarriers}
          onMarketChange={onMarketChange}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 max-sm:gap-1.5">
      {showMarketSelector && onMarketChange && (
        <MarketSelector value={market} onValueChange={onMarketChange} />
      )}
      <TradeTypeCard
        config={config}
        onNext={() => nextTradeType(1)}
        onPrevious={() => nextTradeType(-1)}
      />

      {config.needsDuration && (
        <div className="order-6 sm:order-none">
          <TickDurationSelector
            duration={duration}
            durationUnit={durationUnit}
            onDurationChange={setDuration}
            onUnitChange={setDurationUnit}
            showUnits={!isDigitTrade(selectedTradeType)}
          />
        </div>
      )}

      {config.needsDigit && (
        <div className="order-6 sm:order-none">
          <DigitSelector
            currentDigit={currentDigit}
            mode={config.digitMode === "prediction" ? "prediction" : "barrier"}
            selectedDigit={selectedDigit}
            onDigitChange={setSelectedDigit}
          />
        </div>
      )}

      {config.needsBarrier && (
        <div className="order-6 rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:flex max-sm:items-center max-sm:gap-2 max-sm:p-2 sm:order-none dark:border-[#2f3337] dark:bg-[#151515]">
          <div className="mb-2 text-sm font-semibold text-[#1f2328] max-sm:mb-0 max-sm:w-20 max-sm:shrink-0 max-sm:text-xs">
            Barrier offset
          </div>
          <Input
            value={barrier}
            onChange={(event) => setBarrier(event.target.value)}
            className="h-10 rounded border-[#d6d9dc] text-center font-mono font-semibold max-sm:h-8 max-sm:min-w-0 max-sm:flex-1 max-sm:text-sm"
            placeholder="+0.10"
          />
          <div className="mt-2 text-xs text-[#6f767d] max-sm:hidden">
            Distance from barrier: {distanceFromBarrierLabel(lastPrice, barrier)}
          </div>
        </div>
      )}

      {config.supportsMultiplier && (
        <div className="order-6 rounded-md border border-[#d6d9dc] bg-white p-3 shadow-sm max-sm:p-2 sm:order-none dark:border-[#2f3337] dark:bg-[#151515]">
          <div className="mb-2 text-sm font-semibold text-[#1f2328] max-sm:mb-1 max-sm:text-xs">
            Multiplier
          </div>
          <div className="max-sm:grid max-sm:grid-cols-3 max-sm:gap-1.5">
            <Select
              value={String(multiplier)}
              onValueChange={(value) => setMultiplier(Number(value))}
            >
              <SelectTrigger className="h-10 rounded border-[#d6d9dc] font-semibold max-sm:h-8 max-sm:text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50, 100, 200, 300, 500].map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    x{item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-3 grid grid-cols-2 gap-2 max-sm:col-span-2 max-sm:mt-0 max-sm:gap-1.5">
              <Input
                type="number"
                min={0}
                value={takeProfit}
                onChange={(event) => setTakeProfit(Number(event.target.value))}
                className="h-9 rounded border-[#d6d9dc] text-center font-mono max-sm:h-8 max-sm:text-xs"
                placeholder="Take profit"
              />
              <Input
                type="number"
                min={0}
                value={stopLoss}
                onChange={(event) => setStopLoss(Number(event.target.value))}
                className="h-9 rounded border-[#d6d9dc] text-center font-mono max-sm:h-8 max-sm:text-xs"
                placeholder="Stop loss"
              />
            </div>
          </div>
        </div>
      )}

      <div className="order-4 sm:order-none">
        <StakePayoutToggle
          currency={tradeCurrency}
          mode={payoutMode}
          onModeChange={setPayoutMode}
          onStakeChange={setStake}
          stake={stake}
        />
      </div>

      <div className="order-5 space-y-2 max-sm:grid max-sm:grid-cols-2 max-sm:gap-1.5 max-sm:space-y-0 sm:order-none">
        {config.sides.map((side) => {
          const quote = quotes[side.value] ?? EMPTY_QUOTE;
          return (
            <ProposalButton
              key={side.value}
              disabled={busy || quotesLoading || Boolean(quote.error)}
              label={side.label}
              loading={quotesLoading}
              onClick={() => void handleBuy(side)}
              payout={moneyLabel(quote.payout, tradeCurrency)}
              pct={quote.pct != null ? `${quote.pct.toFixed(2)}%` : undefined}
              tone={side.tone}
            />
          );
        })}
      </div>

      {(activeContract.contractId || activeContract.status === "error") && (
        <div className="order-7 sm:order-none">
          <ProposalSummary rows={activeRows} />
        </div>
      )}

      {activeContract.status === "active" && (
        <Button
          onClick={() => void handleSell()}
          disabled={busy || !activeContract.isValidToSell}
          className="order-5 h-11 w-full rounded-md bg-[#ff444f] text-sm font-semibold text-white hover:bg-[#eb3e48] max-sm:h-9 max-sm:text-xs sm:order-none"
        >
          <X className="mr-2 size-4" />
          {activeContract.isValidToSell
            ? `Close ${moneyLabel(activeContract.sellPrice, tradeCurrency)}`
            : "Waiting for sell price"}
        </Button>
      )}

      {(errorMessage || activeContract.error || activeQuote?.error) && (
        <div className="order-8 rounded-md border border-[#ffd1d4] bg-[#fff7f7] p-3 text-xs font-medium text-[#cc2f39] max-sm:p-2 max-sm:text-[11px] sm:order-none dark:border-[#5b2227] dark:bg-[#2a1114] dark:text-[#ff8b92]">
          {errorMessage || activeContract.error || activeQuote?.error}
        </div>
      )}

      <p className="order-9 text-[11px] text-[#6f767d] max-sm:hidden sm:order-none dark:text-[#a8b0b8]">
        Last price: <span className="font-mono">{lastPrice?.toFixed(4) ?? "-"}</span>
      </p>
    </div>
  );
}

function numberFrom(...values: unknown[]) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function numberLabel(value?: number | null) {
  return value != null && Number.isFinite(value) ? value.toFixed(4) : "-";
}

function moneyLabel(value?: number | null, currency?: string, signed = false) {
  if (value == null || !Number.isFinite(value)) return "-";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function barrierLineFromInput(barrier: string, spot?: number | null) {
  const value = Number(barrier);
  if (!Number.isFinite(value)) return null;
  if ((barrier.startsWith("+") || barrier.startsWith("-")) && spot != null) {
    return spot + value;
  }
  return value;
}

function distanceFromBarrierLabel(spot: number | null | undefined, barrier: string) {
  const line = barrierLineFromInput(barrier, spot);
  if (spot == null || line == null) return "-";
  return Math.abs(spot - line).toFixed(4);
}
