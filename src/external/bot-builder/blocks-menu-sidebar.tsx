import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Mirrors the category tree built by toolbox-items.tsx so the React sidebar
// stays in sync with the Blockly toolbox underneath it.
type Cat = { id: string; name: string; children?: Cat[] };
const CATEGORIES: Cat[] = [
  { id: "trade_parameters", name: "Trade parameters" },
  { id: "purchase_conditions", name: "Purchase conditions" },
  { id: "sell_conditions", name: "Sell conditions (optional)" },
  { id: "trade_results", name: "Restart trading conditions" },
  {
    id: "analysis",
    name: "Analysis",
    children: [{ id: "indicators", name: "Indicators" }],
  },
  {
    id: "utility",
    name: "Utility",
    children: [
      { id: "custom_functions", name: "Custom functions" },
      { id: "variables", name: "Variables" },
      { id: "notifications", name: "Notifications" },
      { id: "time", name: "Time" },
      { id: "logic", name: "Logic" },
      { id: "loops", name: "Loops" },
      { id: "math", name: "Math" },
      { id: "text", name: "Text" },
      { id: "lists", name: "Lists" },
      { id: "miscellaneous", name: "Miscellaneous" },
    ],
  },
];

const matches = (cat: Cat, q: string): boolean => {
  if (!q) return true;
  const lc = q.toLowerCase();
  if (cat.name.toLowerCase().includes(lc)) return true;
  return (cat.children ?? []).some((c) => matches(c, q));
};

const findToolboxItem = (items: any[], id: string): any => {
  for (const it of items) {
    const itemId =
      typeof it?.getId === "function"
        ? it.getId()
        : typeof it?.id_ === "string"
          ? it.id_
          : null;
    const itemName =
      typeof it?.getName === "function"
        ? it.getName()
        : typeof it?.name_ === "string"
          ? it.name_
          : null;
    if (itemId === id || itemName === id) return it;
    const children =
      typeof it?.getChildToolboxItems === "function"
        ? it.getChildToolboxItems()
        : (it?.contents_ ?? []);
    const found = findToolboxItem(Array.isArray(children) ? children : [], id);
    if (found) return found;
  }
  return null;
};

export function openBlocklyCategory(id: string): boolean {
  const ws: any = (window as any).Blockly?.derivWorkspace;
  if (!ws) return false;
  const toolbox: any = ws.getToolbox?.();
  if (!toolbox?.setSelectedItem) return false;
  const items: any[] = toolbox.getToolboxItems?.() ?? [];
  const item = findToolboxItem(items, id);
  if (!item) return false;
  toolbox.setSelectedItem(item);
  return true;
}

export function closeBlocklyFlyout(): void {
  const ws: any = (window as any).Blockly?.derivWorkspace;
  const toolbox: any = ws?.getToolbox?.();
  toolbox?.clearSelection?.();
  ws?.getFlyout?.()?.hide?.();
}

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onQuickStrategy: () => void;
};

export function BlocksMenuSidebar({ collapsed, onToggleCollapsed, onQuickStrategy }: Props) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    analysis: false,
    utility: false,
  });
  const [menuOpen, setMenuOpen] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const onCategoryClick = (cat: Cat) => {
    if (cat.children?.length) {
      setExpanded((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }));
      return;
    }
    setActiveId(cat.id);
    openBlocklyCategory(cat.id);
  };

  const filteredTopLevel = CATEGORIES.filter((c) => matches(c, search));

  if (collapsed) {
    return (
      <button
        type="button"
        className="bot-builder-sidebar-expand-tab"
        onClick={onToggleCollapsed}
        title="Show blocks menu"
        aria-label="Show blocks menu"
      >
        <ChevronRight className="size-4" />
        <span className="bot-builder-sidebar-expand-tab-label">Blocks menu</span>
      </button>
    );
  }

  return (
    <aside className="bot-builder-sidebar" aria-label="Blocks menu">
      <button
        type="button"
        className="bot-builder-quick-strategy"
        onClick={onQuickStrategy}
      >
        Quick strategy
      </button>

      <div className="bot-builder-blocks-menu">
        <button
          type="button"
          className="bot-builder-blocks-menu-header"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        >
          <span>Blocks menu</span>
          <ChevronDown
            className={cn("size-4 transition-transform", !menuOpen && "-rotate-90")}
          />
        </button>
        <button
          type="button"
          className="bot-builder-sidebar-collapse"
          onClick={onToggleCollapsed}
          title="Hide blocks menu"
          aria-label="Hide blocks menu"
        >
          <ChevronLeft className="size-4" />
        </button>

        {menuOpen && (
          <>
            <div className="bot-builder-sidebar-search">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                aria-label="Search blocks"
              />
            </div>

            <ul className="bot-builder-sidebar-list">
              {filteredTopLevel.map((cat) => {
                const has_children = !!cat.children?.length;
                const is_open = expanded[cat.id];
                const is_active = activeId === cat.id;
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      className={cn(
                        "bot-builder-sidebar-item",
                        is_active && "bot-builder-sidebar-item--active",
                      )}
                      onClick={() => onCategoryClick(cat)}
                    >
                      <span className="truncate">{cat.name}</span>
                      {has_children && (
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 transition-transform",
                            !is_open && "-rotate-90",
                          )}
                        />
                      )}
                    </button>
                    {has_children && is_open && (
                      <ul className="bot-builder-sidebar-sublist">
                        {(cat.children ?? [])
                          .filter((c) => matches(c, search))
                          .map((sub) => (
                            <li key={sub.id}>
                              <button
                                type="button"
                                className={cn(
                                  "bot-builder-sidebar-subitem",
                                  activeId === sub.id && "bot-builder-sidebar-item--active",
                                )}
                                onClick={() => {
                                  setActiveId(sub.id);
                                  openBlocklyCategory(sub.id);
                                }}
                              >
                                {sub.name}
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
