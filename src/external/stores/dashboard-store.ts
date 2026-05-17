import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class DashboardStore {
  root_store: RootStore;
  active_tab = 1;
  active_tour = "";
  is_preview_on_popup = false;
  is_dialog_open = false;
  is_chart_modal_visible = false;
  is_trading_view_modal_visible = false;
  strategy_save_type = "unsaved";

  constructor(root_store: RootStore) {
    makeObservable(this, {
      active_tab: observable,
      active_tour: observable,
      is_preview_on_popup: observable,
      is_dialog_open: observable,
      is_chart_modal_visible: observable,
      is_trading_view_modal_visible: observable,
      strategy_save_type: observable,
      bot_builder_symbol: observable,
      setActiveTab: action.bound,
      setActiveTour: action.bound,
      setPreviewOnPopup: action.bound,
      onCloseDialog: action.bound,
      setStrategySaveType: action.bound,
      setBotBuilderSymbol: action.bound,
    });
    this.root_store = root_store;
  }

  bot_builder_symbol: string | null = null;

  setBotBuilderSymbol(symbol: string | null): void {
    this.bot_builder_symbol = symbol;
  }

  setActiveTab(active_tab: number): void {
    this.active_tab = active_tab;
  }

  setActiveTour(active_tour: string): void {
    this.active_tour = active_tour;
  }

  setPreviewOnPopup(is_preview_on_popup: boolean): void {
    this.is_preview_on_popup = is_preview_on_popup;
  }

  onCloseDialog(): void {
    this.is_dialog_open = false;
  }

  setStrategySaveType(strategy_save_type: string): void {
    this.strategy_save_type = strategy_save_type;
  }
}
