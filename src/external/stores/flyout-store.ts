import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class FlyoutStore {
  root_store: RootStore;
  is_visible = false;
  is_help_content = false;
  is_search_flyout = false;
  flyout_content: Element[] = [];
  flyout_width = 400;
  selected_category: unknown = null;
  search_term = "";

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_visible: observable,
      is_help_content: observable,
      is_search_flyout: observable,
      flyout_content: observable.shallow,
      flyout_width: observable,
      selected_category: observable.ref,
      search_term: observable,
      setVisibility: action.bound,
      setContents: action.bound,
      setSelectedCategory: action.bound,
      setIsSearchFlyout: action.bound,
      setFlyoutWidth: action.bound,
      setSearchTerm: action.bound,
      onSequenceClick: action.bound,
      refreshCategory: action.bound,
    });
    this.root_store = root_store;
  }

  setVisibility(is_visible: boolean): void {
    this.is_visible = is_visible;
  }

  setContents(contents: Element[]): void {
    this.flyout_content = contents;
  }

  setSelectedCategory(category: unknown): void {
    this.selected_category = category;
  }

  setIsSearchFlyout(is_search: boolean): void {
    this.is_search_flyout = is_search;
  }

  setFlyoutWidth(width: number): void {
    this.flyout_width = width;
  }

  setSearchTerm(term: string): void {
    this.search_term = term;
  }

  onSequenceClick(): void {
    // No-op placeholder for full flyout-help flow.
  }

  refreshCategory(): void {
    // No-op: Blockly's built-in toolbox refreshes itself when categories change.
    // The reference re-renders the custom flyout sidebar here.
  }
}
