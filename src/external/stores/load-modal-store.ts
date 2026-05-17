import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export type SavedWorkspace = {
  id: string;
  name: string;
  xml: string;
  timestamp: number;
};

export default class LoadModalStore {
  root_store: RootStore;
  is_load_modal_open = false;
  is_open_button_loading = false;
  loaded_local_file: File | null = null;
  recent_workspaces: SavedWorkspace[] = [];

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_load_modal_open: observable,
      is_open_button_loading: observable,
      loaded_local_file: observable.ref,
      recent_workspaces: observable.shallow,
      onLoadModalOpen: action.bound,
      onLoadModalClose: action.bound,
      setRecentWorkspaces: action.bound,
      setLoadedLocalFile: action.bound,
    });
    this.root_store = root_store;
  }

  onLoadModalOpen(): void {
    this.is_load_modal_open = true;
  }

  // Reference's saveWorkspaceToRecent calls this — no-op so the call doesn't
  // crash if ever triggered through the legacy code path.
  updateListStrategies(_workspaces: unknown[]): void {
    // intentionally empty
  }

  onLoadModalClose(): void {
    this.is_load_modal_open = false;
  }

  setRecentWorkspaces(workspaces: SavedWorkspace[]): void {
    this.recent_workspaces = workspaces;
  }

  setLoadedLocalFile(file: File | null): void {
    this.loaded_local_file = file;
  }
}
