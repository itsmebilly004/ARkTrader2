export type BlocklyFieldLike = {
  getText?: () => string | null | undefined;
};

export type BlocklyBlockLike = {
  id?: string;
  type?: string;
  deletable_?: boolean;
  getField?: (name: string) => BlocklyFieldLike | null | undefined;
  getFieldValue?: (name: string) => string | null | undefined;
  getInputTargetBlock?: (name: string) => BlocklyBlockLike | null | undefined;
  initSvg?: () => void;
  render?: (bubble?: boolean) => void;
  setDeletable?: (deletable: boolean) => void;
};

export type BlocklyEventLike = {
  isUiEvent?: boolean;
  type?: string;
};

export type BlocklyWorkspaceLike = {
  current_strategy_id?: string;
  addChangeListener?: (listener: (event: BlocklyEventLike) => void) => void;
  clear?: () => void;
  clearUndo?: () => void;
  getAllBlocks?: (ordered?: boolean) => BlocklyBlockLike[];
  getTopBlocks?: (ordered?: boolean) => BlocklyBlockLike[];
  removeChangeListener?: (listener: (event: BlocklyEventLike) => void) => void;
  render?: () => void;
  scrollCenter?: () => void;
};

export type BlocklyRuntimeLike = {
  Blocks?: Record<string, unknown>;
  Events?: {
    getGroup?: () => string | boolean | null | undefined;
    setGroup?: (group: string | boolean) => void;
  };
  Xml?: {
    clearWorkspaceAndLoadFromXml?: (dom: Element, workspace: BlocklyWorkspaceLike) => void;
    domToText?: (dom: Element) => string;
    domToWorkspace?: (dom: Element, workspace: BlocklyWorkspaceLike) => void;
    workspaceToDom?: (workspace: BlocklyWorkspaceLike) => Element;
  };
  derivWorkspace?: BlocklyWorkspaceLike;
  svgResize?: (workspace: BlocklyWorkspaceLike) => void;
  utils?: {
    idGenerator?: {
      genUid?: () => string;
    };
    xml?: {
      textToDom?: (xmlText: string) => Element;
    };
  };
};

type WindowWithBlockly = Window & {
  Blockly?: BlocklyRuntimeLike;
};

export function getBlocklyRuntime(): BlocklyRuntimeLike | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as WindowWithBlockly).Blockly;
}

export function getDerivWorkspace(): BlocklyWorkspaceLike | undefined {
  return getBlocklyRuntime()?.derivWorkspace;
}
