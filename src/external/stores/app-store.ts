import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class AppStore {
  root_store: RootStore;
  is_mounted = false;

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_mounted: observable,
      onMount: action.bound,
      onUnmount: action.bound,
    });
    this.root_store = root_store;
  }

  onMount(): void {
    this.is_mounted = true;
  }

  onUnmount(): void {
    this.is_mounted = false;
  }
}
