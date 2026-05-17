import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class QuickStrategyStore {
  root_store: RootStore;
  is_open = false;
  selected_strategy = "";
  form_data: Record<string, unknown> = {};

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_open: observable,
      selected_strategy: observable,
      form_data: observable,
      setOpen: action.bound,
      setSelectedStrategy: action.bound,
      setFormData: action.bound,
    });
    this.root_store = root_store;
  }

  setOpen(is_open: boolean): void {
    this.is_open = is_open;
  }

  setSelectedStrategy(strategy: string): void {
    this.selected_strategy = strategy;
  }

  setFormData(data: Record<string, unknown>): void {
    this.form_data = data;
  }
}
