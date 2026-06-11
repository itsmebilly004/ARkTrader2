// Simulation trading service — replaces the real Deriv WebSocket trading service.
// requestProposal / buyProposal / subscribeOpenContract maintain identical signatures
// so bot-builder.tsx and trade-panel.tsx compile and work unchanged.

import { supabase } from "@/integrations/supabase/client";
import type { DerivMessage, TradingAdapter } from "@/lib/deriv";

type DerivRecord = Record<string, unknown>;

export type TradeRequestContext = {
  adapter?: TradingAdapter;
  selectedAccountId?: string | null;
  selectedAccountType?: string | null;
  contractType?: string | null;
};

// ─── Proposal cache ───────────────────────────────────────────────────────────

type ProposalEntry = {
  stake: number;
  payout: number;
  symbol: string;
  contractType: string;
  accountId: string | null;
};
const proposalCache = new Map<string, ProposalEntry>();

// ─── Contract cache ───────────────────────────────────────────────────────────

type ContractEntry = {
  won: boolean;
  stake: number;
  payout: number;
  profit: number;
  entrySpot: number;
  exitSpot: number;
  accountId: string | null;
  symbol: string;
  contractType: string;
};
const contractCache = new Map<string, ContractEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Deriv contract IDs are large, ascending integers (~10 digits). Seed a
// realistic starting value and step it forward so transactions display numeric
// IDs (e.g. "1098705859") instead of "sim_..." strings.
let contractSeed = 1_000_000_000 + Math.floor(Math.random() * 99_000_000);

function nextContractId(): string {
  contractSeed += 1 + Math.floor(Math.random() * 9);
  return String(contractSeed);
}

function simulatedBasePrice(symbol: string): number {
  const bases: Record<string, number> = {
    R_10: 600,
    R_25: 1800,
    R_50: 3200,
    R_75: 5300,
    R_100: 8500,
    "1HZ10V": 620,
    "1HZ25V": 1850,
    "1HZ50V": 3250,
    "1HZ75V": 5400,
    "1HZ100V": 8600,
    BOOM500: 4200,
    BOOM1000: 9800,
    CRASH500: 4100,
    CRASH1000: 9600,
    stpRNG: 100,
    RDBEAR: 2100,
    RDBULL: 2900,
  };
  return bases[symbol] ?? 1000;
}

function randomPrice(symbol: string): number {
  const base = simulatedBasePrice(symbol);
  const noise = base * 0.001 * (Math.random() * 2 - 1);
  return parseFloat((base + noise).toFixed(4));
}

function alignLastDigit(referenceSpot: number, candidateSpot: number): number {
  const referenceText = Math.abs(referenceSpot).toFixed(4);
  const candidateText = Math.abs(candidateSpot).toFixed(4);
  const referenceDigit = referenceText.slice(-1);
  const aligned = Number(`${candidateText.slice(0, -1)}${referenceDigit}`);
  return candidateSpot < 0 ? -aligned : aligned;
}

async function updateAccountBalance(accountId: string, delta: number): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;
  const { data } = await supabase
    .from("accounts")
    .select("balance")
    .eq("user_id", userId)
    .eq("loginid", accountId)
    .maybeSingle();
  if (!data) return;
  const newBalance = Math.max(0, Number(data.balance) + delta);
  await supabase
    .from("accounts")
    .update({ balance: newBalance })
    .eq("user_id", userId)
    .eq("loginid", accountId);
}

async function recordTrade(contract: ContractEntry, accountId: string | null): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;
  await supabase.from("trades").insert({
    user_id: userId,
    symbol: contract.symbol,
    trade_type: contract.contractType,
    stake: contract.stake,
    status: contract.won ? "won" : "lost",
    entry_spot: contract.entrySpot,
    exit_spot: contract.exitSpot,
    profit_loss: contract.profit,
    payout: contract.won ? contract.payout : 0,
    closed_at: new Date().toISOString(),
  });
  if (accountId) {
    await updateAccountBalance(accountId, contract.profit);
  }
}

// ─── DB balance gate ──────────────────────────────────────────────────────────

async function assertSufficientBalance(
  accountId: string | null | undefined,
  stake: number,
): Promise<void> {
  if (!accountId) return;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return;
  const { data } = await supabase
    .from("accounts")
    .select("balance, currency")
    .eq("user_id", userId)
    .eq("loginid", accountId)
    .maybeSingle();
  if (!data) return;
  const balance = Number(data.balance ?? 0);
  if (balance < stake) {
    const currency = String(data.currency ?? "USD");
    throw new Error(
      `Insufficient balance: ${balance.toFixed(2)} ${currency} available, ${stake.toFixed(2)} ${currency} required.`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function requestProposal(
  payload: DerivRecord,
  context: TradeRequestContext = {},
): Promise<DerivMessage> {
  const stake = Number(payload.amount ?? payload.stake ?? 1);
  await assertSufficientBalance(context.selectedAccountId, stake);

  const symbol = String(payload.underlying_symbol ?? payload.symbol ?? "R_100");
  const contractType = String(payload.contract_type ?? context.contractType ?? "CALL");
  const payout = parseFloat((stake * 1.85).toFixed(2));
  const proposalId = uid();

  proposalCache.set(proposalId, {
    stake,
    payout,
    symbol,
    contractType,
    accountId: context.selectedAccountId ?? null,
  });

  return {
    msg_type: "proposal",
    proposal: {
      id: proposalId,
      ask_price: stake,
      payout,
      longcode: `Win ${payout} if the last tick of ${symbol} rises`,
      spot: randomPrice(symbol),
      spot_time: Math.floor(Date.now() / 1000),
    },
  };
}

export async function buyProposal(
  proposalId: string,
  _price: number,
  context: TradeRequestContext = {},
): Promise<DerivMessage> {
  const entry = proposalCache.get(proposalId);
  if (!entry) throw new Error("Proposal not found — cannot buy.");

  const contractId = nextContractId();
  const won = Math.random() < 0.55;
  const entrySpot = randomPrice(entry.symbol);
  const vol = entrySpot * 0.001;
  const rawExitSpot = parseFloat((entrySpot + (won ? vol : -vol) * Math.random()).toFixed(4));
  const exitSpot = alignLastDigit(entrySpot, rawExitSpot);
  const profit = won ? parseFloat((entry.payout - entry.stake).toFixed(2)) : -entry.stake;

  contractCache.set(contractId, {
    won,
    stake: entry.stake,
    payout: entry.payout,
    profit,
    entrySpot,
    exitSpot,
    accountId: context.selectedAccountId ?? entry.accountId,
    symbol: entry.symbol,
    contractType: entry.contractType,
  });
  proposalCache.delete(proposalId);

  return {
    msg_type: "buy",
    buy: {
      contract_id: contractId,
      buy_price: entry.stake,
      payout: entry.payout,
      start_time: Math.floor(Date.now() / 1000),
      longcode: `Win ${entry.payout} if the last tick of ${entry.symbol} rises`,
    },
  };
}

export async function subscribeOpenContract(
  contractId: string,
  onUpdate: (contract: DerivRecord, message: DerivMessage) => void,
): Promise<() => void> {
  const contract = contractCache.get(contractId);
  if (!contract) {
    setTimeout(() => {
      const fallback: DerivRecord = {
        contract_id: contractId,
        is_sold: true,
        status: "lost",
        profit: -1,
        payout: 0,
        entry_spot: 1000,
        exit_spot: alignLastDigit(1000, 999),
      };
      onUpdate(fallback, { proposal_open_contract: fallback });
    }, 2000);
    return () => {};
  }

  const isAccumulator = contract.contractType.toUpperCase().includes("ACCU");
  if (isAccumulator) {
    return simulateAccumulatorLiveTicks(contractId, contract, onUpdate);
  }

  const delayMs = 1500 + Math.floor(Math.random() * 2000);
  let cancelled = false;

  const timerId = setTimeout(() => {
    if (cancelled) return;
    const contractData: DerivRecord = {
      contract_id: contractId,
      is_sold: true,
      status: contract.won ? "won" : "lost",
      profit: contract.profit,
      payout: contract.won ? contract.payout : 0,
      entry_spot: contract.entrySpot,
      exit_spot: contract.exitSpot,
      sell_spot: contract.exitSpot,
      bid_price: contract.won ? contract.payout : 0,
    };
    onUpdate(contractData, { proposal_open_contract: contractData });
    void recordTrade(contract, contract.accountId);
    contractCache.delete(contractId);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(timerId);
  };
}

function simulateAccumulatorLiveTicks(
  contractId: string,
  contract: ContractEntry,
  onUpdate: (contract: DerivRecord, message: DerivMessage) => void,
): () => void {
  let cancelled = false;
  const entrySpot = contract.entrySpot;
  // Barrier distance ~0.038% of spot (typical for 3% growth rate)
  const barrierDistance = Math.max(entrySpot * 0.00038, 0.0001);
  const upperBarrier = parseFloat((entrySpot + barrierDistance).toFixed(4));
  const lowerBarrier = parseFloat((entrySpot - barrierDistance).toFixed(4));
  // Decide outcome: 8-25 ticks before final resolution
  const maxTicks = 8 + Math.floor(Math.random() * 18);
  let tick = 0;
  let currentSpot = entrySpot;
  let currentPayout = parseFloat(contract.stake.toFixed(2));
  const growthPerTick = 0.03; // 3% growth rate per tick

  function scheduleNext() {
    if (cancelled) return;
    const delay = 700 + Math.floor(Math.random() * 600);
    setTimeout(sendTick, delay);
  }

  function sendTick() {
    if (cancelled) return;
    tick++;

    // Random walk on spot
    const step = entrySpot * 0.0003 * (Math.random() * 2 - 1);
    currentSpot = parseFloat((currentSpot + step).toFixed(4));
    currentPayout = parseFloat((currentPayout * (1 + growthPerTick)).toFixed(4));
    const currentProfit = parseFloat((currentPayout - contract.stake).toFixed(2));

    const barrierBreached = currentSpot >= upperBarrier || currentSpot <= lowerBarrier;
    const isFinalTick = tick >= maxTicks;

    if (barrierBreached || (isFinalTick && !contract.won)) {
      // Lost: barrier breached
      const finalProfit = parseFloat((-contract.stake).toFixed(2));
      const finalSpot = alignLastDigit(entrySpot, currentSpot);
      const data: DerivRecord = {
        contract_id: contractId,
        is_sold: true,
        status: "lost",
        profit: finalProfit,
        payout: 0,
        entry_spot: entrySpot,
        exit_spot: finalSpot,
        current_spot: finalSpot,
        high_barrier: upperBarrier,
        low_barrier: lowerBarrier,
        is_valid_to_sell: 0,
      };
      onUpdate(data, { proposal_open_contract: data });
      void recordTrade(
        { ...contract, won: false, profit: finalProfit, exitSpot: finalSpot },
        contract.accountId,
      );
      contractCache.delete(contractId);
      return;
    }

    if (isFinalTick && contract.won) {
      // Won: ran long enough
      const finalSpot = alignLastDigit(entrySpot, currentSpot);
      const data: DerivRecord = {
        contract_id: contractId,
        is_sold: true,
        status: "sold",
        profit: currentProfit,
        payout: currentPayout,
        entry_spot: entrySpot,
        exit_spot: finalSpot,
        current_spot: finalSpot,
        high_barrier: upperBarrier,
        low_barrier: lowerBarrier,
        sell_price: currentPayout,
        bid_price: currentPayout,
        is_valid_to_sell: 0,
      };
      onUpdate(data, { proposal_open_contract: data });
      void recordTrade(
        {
          ...contract,
          won: true,
          profit: currentProfit,
          payout: currentPayout,
          exitSpot: finalSpot,
        },
        contract.accountId,
      );
      contractCache.delete(contractId);
      return;
    }

    // Still live — emit tick with valid sell price
    const data: DerivRecord = {
      contract_id: contractId,
      is_sold: false,
      status: "open",
      profit: currentProfit,
      payout: currentPayout,
      entry_spot: entrySpot,
      current_spot: currentSpot,
      high_barrier: upperBarrier,
      low_barrier: lowerBarrier,
      bid_price: currentPayout,
      sell_price: currentPayout,
      is_valid_to_sell: 1,
      tick_count: tick,
    };
    onUpdate(data, { proposal_open_contract: data });
    scheduleNext();
  }

  // First tick after short delay
  setTimeout(sendTick, 600);

  return () => {
    cancelled = true;
    contractCache.delete(contractId);
  };
}

export async function sellContract(contractId: string, _price: number): Promise<DerivMessage> {
  // Cancel any pending simulation for this contract
  contractCache.delete(contractId);
  return { msg_type: "sell", sell: { sold_for: _price, profit: _price } };
}
