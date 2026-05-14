import { SYNTHETIC_MARKETS, type ActiveSymbol } from "@/lib/deriv";

export type MarketSubgroup = {
  key: string;
  label: string;
  items: ActiveSymbol[];
};

export type MarketGroup = {
  key: string;
  label: string;
  items: ActiveSymbol[];
  subgroups: MarketSubgroup[];
};

export const MARKET_ORDER: Record<string, number> = {
  synthetic_index: 0,
  forex: 1,
  cryptocurrency: 2,
  indices: 3,
  commodities: 4,
  stocks: 5,
  basket_index: 6,
};

export const MARKET_FALLBACK_LABEL: Record<string, string> = {
  synthetic_index: "Derived",
  forex: "Forex",
  cryptocurrency: "Cryptocurrencies",
  indices: "Stock indices",
  commodities: "Commodities",
  stocks: "Stocks",
  basket_index: "Baskets",
};

export function fallbackActiveSymbols(): ActiveSymbol[] {
  return SYNTHETIC_MARKETS.map((market) => ({
    symbol: market.symbol,
    display_name: market.name,
    market: "synthetic_index",
    market_display_name: "Derived",
    submarket: "random_index",
    submarket_display_name: "Continuous indices",
  }));
}

export function activeSymbolsOrFallback(symbols: ActiveSymbol[]): ActiveSymbol[] {
  return symbols.length > 0 ? symbols : fallbackActiveSymbols();
}

export function groupActiveSymbols(symbols: ActiveSymbol[]): MarketGroup[] {
  const byMarket = new Map<
    string,
    {
      label: string;
      items: ActiveSymbol[];
      subgroups: Map<string, MarketSubgroup>;
    }
  >();

  for (const item of activeSymbolsOrFallback(symbols)) {
    const marketKey = item.market || "other";
    const marketLabel =
      item.market_display_name || MARKET_FALLBACK_LABEL[marketKey] || marketKey || "Other";
    const submarketKey = item.submarket || "other";
    const submarketLabel = item.submarket_display_name || item.market_display_name || "Other";

    let market = byMarket.get(marketKey);
    if (!market) {
      market = { label: marketLabel, items: [], subgroups: new Map() };
      byMarket.set(marketKey, market);
    }
    market.items.push(item);

    let subgroup = market.subgroups.get(submarketKey);
    if (!subgroup) {
      subgroup = { key: submarketKey, label: submarketLabel, items: [] };
      market.subgroups.set(submarketKey, subgroup);
    }
    subgroup.items.push(item);
  }

  return Array.from(byMarket.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      items: sortSymbols(value.items),
      subgroups: Array.from(value.subgroups.values())
        .map((subgroup) => ({ ...subgroup, items: sortSymbols(subgroup.items) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => {
      const ar = MARKET_ORDER[a.key] ?? 99;
      const br = MARKET_ORDER[b.key] ?? 99;
      if (ar !== br) return ar - br;
      return a.label.localeCompare(b.label);
    });
}

export function findActiveSymbol(symbols: ActiveSymbol[], symbol: string) {
  return activeSymbolsOrFallback(symbols).find((item) => item.symbol === symbol);
}

function sortSymbols(symbols: ActiveSymbol[]) {
  return [...symbols].sort((a, b) => a.display_name.localeCompare(b.display_name));
}
