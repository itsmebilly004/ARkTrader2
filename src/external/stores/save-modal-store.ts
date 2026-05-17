import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export type SaveType = "local" | "google_drive" | "unsaved";

export default class SaveModalStore {
  root_store: RootStore;
  is_save_modal_open = false;
  bot_name = "Untitled Bot";
  save_as_collection = false;
  save_type: SaveType = "local";

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_save_modal_open: observable,
      bot_name: observable,
      save_as_collection: observable,
      save_type: observable,
      toggleSaveModal: action.bound,
      onConfirmSave: action.bound,
      setBotName: action.bound,
      setSaveType: action.bound,
    });
    this.root_store = root_store;
  }

  toggleSaveModal(): void {
    this.is_save_modal_open = !this.is_save_modal_open;
  }

  onConfirmSave({ bot_name, save_type }: { bot_name: string; save_type: SaveType }): void {
    this.bot_name = bot_name;
    this.save_type = save_type;
    this.is_save_modal_open = false;
  }

  setBotName(bot_name: string): void {
    this.bot_name = bot_name;
  }

  setSaveType(save_type: SaveType): void {
    this.save_type = save_type;
  }
}
