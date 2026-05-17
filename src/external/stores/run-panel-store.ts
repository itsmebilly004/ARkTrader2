import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

/**
 * Stub: arktrader's existing bot runtime owns execution state.
 * This store only carries the flags the Blockly listeners read.
 */
export default class RunPanelStore {
  root_store: RootStore;
  is_running = false;
  is_drawer_open = false;
  has_open_contract = false;

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_running: observable,
      is_drawer_open: observable,
      has_open_contract: observable,
      setIsRunning: action.bound,
      toggleDrawer: action.bound,
    });
    this.root_store = root_store;
  }

  setIsRunning(is_running: boolean): void {
    this.is_running = is_running;
  }

  toggleDrawer(is_drawer_open: boolean): void {
    this.is_drawer_open = is_drawer_open;
  }
}
