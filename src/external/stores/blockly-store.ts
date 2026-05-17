import { action, computed, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class BlocklyStore {
  root_store: RootStore;
  is_loading = false;
  active_tab = "workspace";
  _has_saved_bots = false;

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_loading: observable,
      active_tab: observable,
      _has_saved_bots: observable,
      has_active_bot: computed,
      has_saved_bots: computed,
      setLoading: action.bound,
      setActiveTab: action.bound,
      setHasSavedBots: action.bound,
    });
    this.root_store = root_store;
  }

  get has_active_bot(): boolean {
    const workspace = window.Blockly?.derivWorkspace;
    if (!workspace) return false;
    const top_blocks = workspace.getTopBlocks?.();
    return !!top_blocks && top_blocks.length > 0;
  }

  get has_saved_bots(): boolean {
    return this._has_saved_bots;
  }

  setLoading(is_loading: boolean): void {
    this.is_loading = is_loading;
  }

  setActiveTab(tab: string): void {
    this.active_tab = tab;
  }

  setHasSavedBots(value: boolean): void {
    this._has_saved_bots = value;
  }

  setContainerSize = (): void => {
    if (this.active_tab !== "workspace") return;
    try {
      const workspace = window.Blockly?.derivWorkspace;
      if (workspace) {
        // @ts-ignore — Blockly v10 svgResize takes the workspace
        window.Blockly?.svgResize?.(workspace);
      }
    } catch {
      // swallow — Blockly may not be mounted yet
    }
  };

  onMount = (): void => {
    window.addEventListener("resize", this.setContainerSize);
  };

  onUnmount = (): void => {
    window.removeEventListener("resize", this.setContainerSize);
  };
}
