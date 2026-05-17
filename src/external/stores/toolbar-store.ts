import { action, makeObservable, observable } from "mobx";
import type RootStore from "./root-store";

export default class ToolbarStore {
  root_store: RootStore;
  is_reset_button_clicked = false;
  is_dialog_open = false;
  file_name = "Untitled Bot";
  has_undo_stack = false;
  has_redo_stack = false;

  constructor(root_store: RootStore) {
    makeObservable(this, {
      is_reset_button_clicked: observable,
      is_dialog_open: observable,
      file_name: observable,
      has_undo_stack: observable,
      has_redo_stack: observable,
      setResetButtonState: action.bound,
      onResetClick: action.bound,
      onUndoClick: action.bound,
      onRedoClick: action.bound,
      onSortClick: action.bound,
      onZoomInOutClick: action.bound,
      setFileName: action.bound,
      setHasUndoStack: action.bound,
      setHasRedoStack: action.bound,
    });
    this.root_store = root_store;
  }

  setHasUndoStack(): void {
    const workspace = window.Blockly?.derivWorkspace;
    this.has_undo_stack = !!workspace?.undoStack_?.length;
  }

  setHasRedoStack(): void {
    const workspace = window.Blockly?.derivWorkspace;
    this.has_redo_stack = !!workspace?.redoStack_?.length;
  }

  setResetButtonState(is_reset_button_clicked: boolean): void {
    this.is_reset_button_clicked = is_reset_button_clicked;
  }

  setFileName(name: string): void {
    this.file_name = name;
  }

  onResetClick(): void {
    const workspace = window.Blockly?.derivWorkspace;
    if (!workspace) return;
    this.setResetButtonState(true);
    workspace.cleanUp?.();
  }

  onUndoClick(): void {
    window.Blockly?.derivWorkspace?.undo(false);
  }

  onRedoClick(): void {
    window.Blockly?.derivWorkspace?.undo(true);
  }

  onSortClick(): void {
    window.Blockly?.derivWorkspace?.cleanUp?.();
  }

  onZoomInOutClick(is_zoom_in: boolean): void {
    const workspace = window.Blockly?.getMainWorkspace?.();
    if (!workspace) return;
    const metrics = workspace.getMetrics?.();
    if (!metrics) return;
    const direction = is_zoom_in ? 1 : -1;
    workspace.zoom?.(metrics.viewWidth / 2, metrics.viewHeight / 2, direction);
  }
}
