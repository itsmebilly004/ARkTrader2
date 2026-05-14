import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bitcoin,
  Boxes,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronRight,
  Gem,
  Globe2,
  Search,
  Star,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getActiveSymbols, type ActiveSymbol } from "@/lib/deriv";
import { activeSymbolsOrFallback, findActiveSymbol } from "@/lib/market-groups";
import { cn } from "@/lib/utils";

type MarketSelectorProps = {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

type CategoryKey = "favorites" | "derived" | "forex" | "indices" | "cryptocurrency" | "commodities";
type DerivedSection = "baskets" | "synthetics";

type MarketCategory = {
  key: CategoryKey;
  label: string;
  Icon: LucideIcon;
};

type SymbolGroup = {
  key: string;
  label: string;
  items: ActiveSymbol[];
};

const FAVORITES_STORAGE_KEY = "arktrader-market-favorites";

const CATEGORIES: MarketCategory[] = [
  { key: "favorites", label: "Favorites", Icon: Star },
  { key: "derived", label: "Derived", Icon: Globe2 },
  { key: "forex", label: "Forex", Icon: Boxes },
  { key: "indices", label: "Stock Indices", Icon: ChartNoAxesColumnIncreasing },
  { key: "cryptocurrency", label: "Cryptocurrencies", Icon: Bitcoin },
  { key: "commodities", label: "Commodities", Icon: Gem },
];

const DERIVED_SECTIONS: { key: DerivedSection; label: string }[] = [
  { key: "baskets", label: "Baskets" },
  { key: "synthetics", label: "Synthetics" },
];

export function MarketSelector({ className, onValueChange, value }: MarketSelectorProps) {
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("derived");
  const [activeDerivedSection, setActiveDerivedSection] = useState<DerivedSection>("synthetics");
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());

  useEffect(() => {
    let active = true;
    setLoading(true);
    getActiveSymbols()
      .then((items) => {
        if (active) setSymbols(items);
      })
      .catch((error) => {
        console.warn("[Market Selector] active symbols unavailable, using fallback markets", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const allSymbols = useMemo(() => activeSymbolsOrFallback(symbols), [symbols]);
  const selected = useMemo(() => findActiveSymbol(symbols, value), [symbols, value]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const visibleItems = useMemo(
    () =>
      filterSymbols({
        activeCategory,
        activeDerivedSection,
        allSymbols,
        favoriteSet,
        query,
      }),
    [activeCategory, activeDerivedSection, allSymbols, favoriteSet, query],
  );
  const groupedItems = useMemo(() => groupSymbols(visibleItems), [visibleItems]);
  const currentCategory = CATEGORIES.find((category) => category.key === activeCategory);

  useEffect(() => {
    const current = selected ?? allSymbols.find((item) => item.symbol === value);
    if (!current) return;
    const nextCategory = categoryForSymbol(current);
    setActiveCategory(nextCategory);
    if (nextCategory === "derived") {
      setActiveDerivedSection(isBasketSymbol(current) ? "baskets" : "synthetics");
    }
  }, [allSymbols, selected, value]);

  function chooseSymbol(symbol: string) {
    onValueChange(symbol);
    setOpen(false);
  }

  function toggleFavorite(symbol: string) {
    setFavorites((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol].slice(-80),
    );
  }

  return (
    <section className={cn("min-w-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[4px] border border-[#bcc4c9] bg-white px-3 py-2.5 text-left transition hover:bg-[#f7f8f9] max-sm:px-2.5 max-sm:py-2 dark:border-[#2f3337] dark:bg-[#151515] dark:hover:bg-[#202020]"
          >
            <MarketGlyph symbol={selected ?? value} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[#333333] max-sm:text-xs dark:text-[#f2f2f2]">
                {selected?.display_name ?? value}
              </span>
              <span className="block truncate text-[11px] text-[#7a838c] max-sm:text-[10px] dark:text-[#a8b0b8]">
                {selected
                  ? `${selected.market_display_name || "Deriv"} / ${selected.submarket_display_name || selected.symbol}`
                  : loading
                    ? "Loading markets"
                    : "Deriv markets"}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-[#6f767d] transition-transform dark:text-[#a8b0b8]",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[calc(100vw-1rem)] overflow-hidden rounded-[3px] border-[#d6d9dc] bg-white p-0 text-[#333333] shadow-xl sm:w-[560px] dark:border-[#2f3337] dark:bg-[#151515] dark:text-[#eeeeee]"
          sideOffset={6}
        >
          <div className="grid max-h-[min(723px,76dvh)] min-h-[420px] grid-cols-[238px_minmax(0,1fr)] overflow-hidden max-sm:grid-cols-[132px_minmax(0,1fr)] max-sm:min-h-[360px]">
            <aside className="border-r border-[#e4e6e8] bg-[#f0f2f3] py-4 max-sm:py-3 dark:border-[#2a2e32] dark:bg-[#101010]">
              <div className="px-5 pb-4 text-base font-bold max-sm:px-3 max-sm:pb-2 max-sm:text-sm">
                Markets
              </div>
              <nav className="space-y-0.5">
                {CATEGORIES.map((category) => {
                  const active = activeCategory === category.key;
                  const Icon = category.Icon;
                  if (category.key === "derived") {
                    return (
                      <div key={category.key}>
                        <CategoryButton
                          active={active}
                          onClick={() => setActiveCategory("derived")}
                        >
                          <Icon className="size-4" />
                          <span className="min-w-0 flex-1 truncate">{category.label}</span>
                          <ChevronRight className="size-4 rotate-90 text-[#777777]" />
                        </CategoryButton>
                        <div className="py-1">
                          {DERIVED_SECTIONS.map((section) => (
                            <button
                              key={section.key}
                              type="button"
                              onClick={() => {
                                setActiveCategory("derived");
                                setActiveDerivedSection(section.key);
                              }}
                              className={cn(
                                "flex h-10 w-full items-center px-12 text-left text-sm font-semibold transition max-sm:h-8 max-sm:px-7 max-sm:text-xs",
                                active && activeDerivedSection === section.key
                                  ? "text-[#1f2328] dark:text-[#f2f2f2]"
                                  : "text-[#4d555b] hover:bg-white/60 dark:text-[#d8d8d8] dark:hover:bg-[#202020]",
                              )}
                            >
                              {section.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <CategoryButton
                      key={category.key}
                      active={active}
                      onClick={() => setActiveCategory(category.key)}
                    >
                      <Icon className="size-4" />
                      <span className="min-w-0 flex-1 truncate">{category.label}</span>
                    </CategoryButton>
                  );
                })}
              </nav>
            </aside>

            <div className="min-w-0 bg-white dark:bg-[#151515]">
              <div className="border-b border-[#e7e9eb] p-4 max-sm:p-2 dark:border-[#2a2e32]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#333333] dark:text-[#d8d8d8]" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search..."
                    className="h-11 rounded-[3px] border-[#9ea8ad] bg-white pl-9 text-sm max-sm:h-9 dark:border-[#3a3a3a] dark:bg-[#101010] dark:text-[#f2f2f2]"
                  />
                </div>
              </div>

              <div className="max-h-[calc(min(723px,76dvh)-75px)] overflow-y-auto pb-4 max-sm:max-h-[calc(min(76dvh,520px)-57px)]">
                {groupedItems.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-[#777777] dark:text-[#b7b7b7]">
                    {activeCategory === "favorites"
                      ? "No favorite markets yet."
                      : "No markets match your search."}
                  </div>
                ) : (
                  groupedItems.map((group) => (
                    <div key={group.key}>
                      <div className="px-7 pb-2 pt-4 text-sm font-bold max-sm:px-3 max-sm:pb-1 max-sm:pt-3 max-sm:text-[11px]">
                        {group.label}
                      </div>
                      <div className="space-y-0.5 px-4 max-sm:px-1.5">
                        {group.items.map((item) => {
                          const active = item.symbol === value;
                          const favorite = favoriteSet.has(item.symbol);
                          return (
                            <button
                              key={item.symbol}
                              type="button"
                              onClick={() => chooseSymbol(item.symbol)}
                              className={cn(
                                "flex min-h-10 w-full items-center gap-2 rounded-[3px] px-3 py-2 text-left transition max-sm:min-h-9 max-sm:px-2 max-sm:py-1.5",
                                active
                                  ? "bg-[#dfe3e4] text-[#1f2328] dark:bg-[#2a3033] dark:text-[#f2f2f2]"
                                  : "bg-transparent text-[#333333] hover:bg-[#eef1f2] dark:text-[#d8d8d8] dark:hover:bg-[#202020]",
                              )}
                            >
                              <MarketGlyph symbol={item} compact />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium max-sm:text-xs">
                                {item.display_name}
                              </span>
                              <button
                                type="button"
                                aria-label={
                                  favorite
                                    ? `Remove ${item.display_name} from favorites`
                                    : `Add ${item.display_name} to favorites`
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleFavorite(item.symbol);
                                }}
                                className="flex size-8 shrink-0 items-center justify-center rounded text-[#333333] hover:bg-white/70 max-sm:size-7 dark:text-[#eeeeee] dark:hover:bg-[#101010]"
                              >
                                <Star
                                  className={cn(
                                    "size-5 max-sm:size-4",
                                    favorite && "fill-[#ffb020] text-[#ffb020]",
                                  )}
                                />
                              </button>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <span className="sr-only">
            {currentCategory?.label ?? "Markets"} market selector, {visibleItems.length} symbols
            visible.
          </span>
        </PopoverContent>
      </Popover>
    </section>
  );
}

function CategoryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-full items-center gap-3 px-5 text-left text-sm transition max-sm:h-8 max-sm:gap-2 max-sm:px-3 max-sm:text-[11px]",
        active
          ? "bg-white font-bold text-[#1f2328] before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-[#ff444f] dark:bg-[#151515] dark:text-[#f2f2f2]"
          : "font-medium text-[#4d555b] hover:bg-white/60 dark:text-[#d8d8d8] dark:hover:bg-[#202020]",
      )}
    >
      {children}
    </button>
  );
}

function MarketGlyph({
  compact = false,
  symbol,
}: {
  compact?: boolean;
  symbol: ActiveSymbol | string;
}) {
  const display = typeof symbol === "string" ? symbol : symbol.display_name;
  const numericBadge = display.match(/\d+/)?.[0] ?? "FX";
  const isOneSecond =
    /\(1s\)/i.test(display) || /1HZ/i.test(typeof symbol === "string" ? symbol : symbol.symbol);
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-sm bg-[#edf3f3]",
        compact ? "size-8 max-sm:size-7" : "size-10 max-sm:size-8",
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 rounded-[2px] bg-[#111111] px-1 font-mono font-bold leading-3 text-white",
          compact ? "text-[8px]" : "text-[9px]",
        )}
      >
        {numericBadge.slice(0, 3)}
      </span>
      {isOneSecond && (
        <span className="absolute right-0.5 top-0.5 flex size-3 items-center justify-center rounded-full bg-[#ff444f] text-[7px] font-bold text-white">
          s
        </span>
      )}
      <span className="mt-2 flex items-end gap-[2px]">
        {[8, 13, 7, 16, 10].map((height, index) => (
          <span
            key={index}
            className={cn(index % 2 === 0 ? "bg-[#4bb4b3]" : "bg-[#9aa7a9]")}
            style={{ height, width: 2 }}
          />
        ))}
      </span>
    </span>
  );
}

function filterSymbols({
  activeCategory,
  activeDerivedSection,
  allSymbols,
  favoriteSet,
  query,
}: {
  activeCategory: CategoryKey;
  activeDerivedSection: DerivedSection;
  allSymbols: ActiveSymbol[];
  favoriteSet: Set<string>;
  query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  return allSymbols
    .filter((item) => {
      if (activeCategory === "favorites") return favoriteSet.has(item.symbol);
      if (activeCategory === "derived") {
        const derived = categoryForSymbol(item) === "derived";
        if (!derived) return false;
        return activeDerivedSection === "baskets" ? isBasketSymbol(item) : !isBasketSymbol(item);
      }
      return categoryForSymbol(item) === activeCategory;
    })
    .filter((item) => {
      if (!normalizedQuery) return true;
      return [item.display_name, item.symbol, item.market_display_name, item.submarket_display_name]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

function groupSymbols(items: ActiveSymbol[]): SymbolGroup[] {
  const bySubmarket = new Map<string, SymbolGroup>();
  for (const item of items) {
    const key = item.submarket || item.market || "other";
    const label = item.submarket_display_name || item.market_display_name || "Other";
    const group = bySubmarket.get(key);
    if (group) group.items.push(item);
    else bySubmarket.set(key, { key, label, items: [item] });
  }
  return Array.from(bySubmarket.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function categoryForSymbol(item: ActiveSymbol): CategoryKey {
  const market = item.market;
  if (market === "forex") return "forex";
  if (market === "indices") return "indices";
  if (market === "cryptocurrency") return "cryptocurrency";
  if (market === "commodities") return "commodities";
  return "derived";
}

function isBasketSymbol(item: ActiveSymbol) {
  return [item.market, item.market_display_name, item.submarket, item.submarket_display_name]
    .join(" ")
    .toLowerCase()
    .includes("basket");
}

function readFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
