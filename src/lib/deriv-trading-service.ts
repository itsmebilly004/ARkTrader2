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

function simulatedBasePrice(symbol: string): number {
  const bases: Record<string, number> = {
    R_10: 600, R_25: 1800, R_50: 3200, R_75: 5300, R_100: 8500,
    "1HZ10V": 620, "1HZ25V": 1850, "1HZ50V": 3250, "1HZ75V": 5400, "1HZ100V": 8600,
    BOOM500: 4200, BOOM1000: 9800, CRASH500: 4100, CRASH1000: 9600,
    stpRNG: 100, RDBEAR: 2100, RDBULL: 2900,
  };
  return bases[symbol] ?? 1000;
}

function randomPrice(symbol: string): number {
  const base = simulatedBasePrice(symbol);
  const noise = base * 0.001 * (Math.random() * 2 - 1);
  return parseFloat((base + noise).toFixed(4));
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

async function recordTrade(
  contract: ContractEntry,
  accountId: string | null,
): Promise<void> {
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function requestProposal(
  payload: DerivRecord,
  context: TradeRequestContext = {},
): Promise<DerivMessage> {
  const stake = Number(payload.amount ?? payload.stake ?? 1);
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

  const contractId = uid();
  const won = Math.random() < 0.55;
  const entrySpot = randomPrice(entry.symbol);
  const vol = entrySpot * 0.001;
  const exitSpot = parseFloat((entrySpot + (won ? vol : -vol) * Math.random()).toFixed(4));
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
        exit_spot: 999,
      };
      onUpdate(fallback, { proposal_open_contract: fallback });
    }, 2000);
    return () => {};
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

export async function sellContract(_contractId: string, _price: number): Promise<DerivMessage> {
  return { msg_type: "sell", sell: { sold_for: _price } };
}
