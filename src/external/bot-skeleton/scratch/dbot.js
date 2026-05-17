// Visual-only DBot. The reference module also wires Interpreter (the
// @deriv/js-interpreter-backed trade engine) and api_base (a Deriv websocket
// helper). For the visual-only port both are dropped — bot execution lives
// in arktrader's existing runtime — and the surface here is reduced to:
//   * initWorkspace: inject Blockly + load main.xml / most recent strategy
//   * generateCode / saveRecentWorkspace: still useful, no trade-engine state
//   * shouldRunBot, valueInputLimitationsListener, checkForRequiredBlocks: workspace validation
//   * runBot / stopBot / terminateBot / terminateConnection: no-op bridges

import { save_types } from "../constants";
import { config } from "../constants/config";
import ApiHelpers from "../services/api/api-helpers";
import { compareXml, observer as globalObserver } from "../utils";
import { getSavedWorkspaces, saveWorkspaceToRecent } from "../utils/local-storage";
import { isDbotRTL } from "../utils/workspace";
import main_xml from "./xml/main.xml?raw";
import { loadBlockly } from "./blockly";
import { registerDerivStubBlocks } from "@/lib/blockly-deriv-stubs";
import DBotStore from "./dbot-store";
import { isAllRequiredBlocksEnabled, updateDisabledBlocks, validateErrorOnBlockDelete } from "./utils";

class DBot {
  constructor() {
    this.interpreter = null;
    this.workspace = null;
    this.before_run_funcs = [];
    this.symbol = null;
    this.is_bot_running = false;
  }

  /**
   * Initialises the workspace and mounts it to a container element (`scratch_div`).
   */
  async initWorkspace(public_path, store, api_helpers_store, is_mobile, is_dark_mode) {
    await loadBlockly(is_dark_mode);
    registerDerivStubBlocks();
    const recent_files = await getSavedWorkspaces();

    // Lightweight onchange for trade_definition_tradetype: refresh dropdowns
    // when SYMBOL_LIST / TRADETYPECAT_LIST change. We keep the contracts_for
    // hook (now stubbed) but drop the interpreter.watchTicks call.
    if (window.Blockly?.Blocks?.trade_definition_tradetype) {
      window.Blockly.Blocks.trade_definition_tradetype.onchange = function (event) {
        if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
          return;
        }
        this.enforceLimitations?.();
        const { name, type } = event;
        if (type !== window.Blockly.Events.BLOCK_CHANGE) return;

        const is_symbol_list_change = name === "SYMBOL_LIST";
        const is_trade_type_cat_list_change = name === "TRADETYPECAT_LIST";
        if (!is_symbol_list_change && !is_trade_type_cat_list_change) return;

        const { contracts_for } = ApiHelpers?.instance ?? {};
        const top_parent_block = this.getTopParent?.();
        if (!top_parent_block) return;
        const market_block = top_parent_block.getChildByType?.("trade_definition_market");
        if (!market_block) return;
        const market = market_block.getFieldValue("MARKET_LIST");
        const submarket = market_block.getFieldValue("SUBMARKET_LIST");
        const symbol = market_block.getFieldValue("SYMBOL_LIST");
        const category = this.getFieldValue("TRADETYPECAT_LIST");
        const trade_type = this.getFieldValue("TRADETYPE_LIST");

        if (is_symbol_list_change) {
          contracts_for?.getTradeTypeCategories?.(market, submarket, symbol).then((categories) => {
            const category_field = this.getField?.("TRADETYPECAT_LIST");
            category_field?.updateOptions?.(categories, {
              default_value: category,
              should_pretend_empty: true,
              event_group: event.group,
            });
          });
        } else if (is_trade_type_cat_list_change && event.blockId === this.id) {
          contracts_for?.getTradeTypes?.(market, submarket, symbol, category).then((trade_types) => {
            const trade_type_field = this.getField?.("TRADETYPE_LIST");
            trade_type_field?.updateOptions?.(trade_types, {
              default_value: trade_type,
              should_pretend_empty: true,
              event_group: event.group,
            });
          });
        }
      };
    }

    return new Promise((resolve, reject) => {
      if (public_path) {
        // eslint-disable-next-line no-global-assign, camelcase
        try { __webpack_public_path__ = public_path; } catch { /* not webpack */ }
      }
      ApiHelpers.setInstance(api_helpers_store);
      DBotStore.setInstance(store);

      try {
        const window_width = window.innerWidth;
        let workspaceScale = 0.7;
        if (window_width < 1640) {
          if (is_mobile) {
            workspaceScale = 0.6;
          } else {
            const scratch_div_width = document.getElementById("scratch_div")?.offsetWidth ?? window_width;
            workspaceScale = scratch_div_width / window_width / 1.5;
          }
        }
        const el_scratch_div = document.getElementById("scratch_div");
        if (!el_scratch_div) {
          reject(new Error("scratch_div not found in DOM"));
          return;
        }

        const toolbox_xml = DBotStore.instance?.toolbox_xml ?? null;
        this.workspace = window.Blockly.inject(el_scratch_div, {
          media: "/blockly-media/",
          renderer: "zelos",
          trashcan: !is_mobile,
          zoom: { wheel: true, startScale: workspaceScale },
          scrollbars: true,
          theme: window.Blockly.Themes?.zelos_renderer,
          ...(toolbox_xml ? { toolbox: toolbox_xml } : {}),
        });

        this.workspace.RTL = isDbotRTL();
        this.workspace.cached_xml = { main: main_xml };

        this.workspace.addChangeListener(this.valueInputLimitationsListener.bind(this));
        this.workspace.addChangeListener((event) => updateDisabledBlocks(this.workspace, event));
        this.workspace.addChangeListener((event) => this.workspace.dispatchBlockEventEffects?.(event));
        this.workspace.addChangeListener((event) => {
          if (event.type === "drag" && !event.isStart && !is_mobile) validateErrorOnBlockDelete();
          if (event.type === window.Blockly.Events.BLOCK_CHANGE) {
            const block = this.workspace.getBlockById(event.blockId);
            if (is_mobile && block && event.element === "collapsed") {
              block.contextMenu = false;
            }
          }
        });

        window.Blockly.derivWorkspace = this.workspace;

        const varDB = new window.Blockly.Names("window");
        varDB.variableMap = window.Blockly.derivWorkspace.getVariableMap();
        if (window.Blockly.JavaScript) {
          window.Blockly.JavaScript.variableDB_ = varDB;
        }

        this.addBeforeRunFunction(this.unselectBlocks.bind(this));
        this.addBeforeRunFunction(this.disableStrayBlocks.bind(this));
        this.addBeforeRunFunction(this.checkForErroredBlocks.bind(this));
        this.addBeforeRunFunction(this.checkForRequiredBlocks.bind(this));

        this.workspace.current_strategy_id = window.Blockly.utils.idGenerator.genUid();
        window.Blockly.derivWorkspace.strategy_to_load = main_xml;
        window.Blockly.getMainWorkspace().strategy_to_load = main_xml;
        window.Blockly.getMainWorkspace().RTL = isDbotRTL();

        let file_name = config().default_file_name;
        if (recent_files && recent_files.length) {
          const latest_file = recent_files[0];
          window.Blockly.derivWorkspace.strategy_to_load = latest_file.xml;
          window.Blockly.getMainWorkspace().strategy_to_load = latest_file.xml;
          file_name = latest_file.name;
          window.Blockly.derivWorkspace.current_strategy_id = latest_file.id;
          window.Blockly.getMainWorkspace().current_strategy_id = latest_file.id;
        }

        // Re-apply stubs inside the Promise in case inject or toolbox setup cleared any.
        registerDerivStubBlocks();

        const event_group = `dbot-load${Date.now()}`;
        window.Blockly.Events.setGroup(event_group);

        // Diagnostic: surface any XML block types still missing after stub registration.
        try {
          const _xmlDoc = new DOMParser().parseFromString(
            window.Blockly.derivWorkspace.strategy_to_load,
            'text/xml',
          );
          const _allTypes = [..._xmlDoc.querySelectorAll('block')]
            .map(b => b.getAttribute('type'))
            .filter(Boolean);
          const _unregistered = _allTypes.filter(t => !window.Blockly.Blocks[t]);
          if (_unregistered.length > 0) {
            // eslint-disable-next-line no-console
            console.warn('[Blockly] Unregistered block types found:', [...new Set(_unregistered)]);
          }
        } catch { /* noop — diagnostic only */ }

        window.Blockly.Xml.domToWorkspace(
          window.Blockly.utils.xml.textToDom(window.Blockly.derivWorkspace.strategy_to_load),
          this.workspace,
        );

        const { save_modal } = DBotStore.instance ?? {};
        save_modal?.setBotName?.(file_name);

        this.workspace.cleanUp(0, is_mobile ? 60 : 56);
        this.workspace.clearUndo();

        window.dispatchEvent(new Event("resize"));
        window.addEventListener("dragover", DBot.handleDragOver);
        window.addEventListener("drop", (e) => DBot.handleDropOver(e, DBotStore.instance?.handleFileChange));
        if (el_scratch_div.parentNode) {
          el_scratch_div.parentNode.style.overflow = "hidden";
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  isStrategyUpdated(current_xml_dom, recent_files) {
    if (recent_files && recent_files.length) {
      const stored_strategy = recent_files.filter(
        (strategy) => strategy?.id === this.workspace?.current_strategy_id,
      )?.[0];
      if (stored_strategy?.xml) {
        const current_xml = window.Blockly.Xml.domToText(current_xml_dom);
        if (compareXml(stored_strategy.xml, current_xml)) return false;
      }
    }
    return true;
  }

  async saveRecentWorkspace() {
    const current_xml_dom = this?.workspace ? window.Blockly?.Xml?.workspaceToDom(this.workspace) : null;
    try {
      const recent_files = await getSavedWorkspaces();
      if (current_xml_dom && this.isStrategyUpdated(current_xml_dom, recent_files)) {
        await saveWorkspaceToRecent(current_xml_dom, save_types.UNSAVED);
      }
    } catch (error) {
      globalObserver.emit("Error", error);
      if (current_xml_dom) await saveWorkspaceToRecent(current_xml_dom, save_types.UNSAVED);
    }
  }

  addBeforeRunFunction(func) {
    this.before_run_funcs.push(func);
  }

  shouldRunBot() {
    return this.before_run_funcs.every((func) => !!func());
  }

  // --- Visual-only stubs: arktrader's runtime owns trade execution ---
  async initializeInterpreter() {}
  runBot() {
    globalObserver.emit("ui.log.warn", "Bot execution from Blockly is handled by arktrader runtime.");
  }
  async stopBot() {
    this.is_bot_running = false;
  }
  async terminateBot() {
    this.is_bot_running = false;
  }
  terminateConnection = () => {};

  /**
   * Generates the JS code body the trade engine WOULD have run. Useful for
   * exporting/inspecting strategies even without an interpreter wired.
   */
  generateCode(limitations = {}) {
    return `
            var BinaryBotPrivateInit;
            var BinaryBotPrivateStart;
            var BinaryBotPrivateBeforePurchase;
            var BinaryBotPrivateDuringPurchase;
            var BinaryBotPrivateAfterPurchase;
            var BinaryBotPrivateLastTickTime;
            var BinaryBotPrivateTickAnalysisList = [];
            var BinaryBotPrivateHasCalledTradeOptions = false;
            function recursiveList(list, final_list){
                for(var i=0; i < list.length; i++){
                    if(typeof(list[i]) === 'object'){ recursiveList(list[i], final_list); }
                    if(typeof(list[i]) == 'number'){ final_list.push(list[i]); }
                }
                return final_list;
            }
            function BinaryBotPrivateRun(f, arg) { if (f) return f(arg); return false; }
            function BinaryBotPrivateTickAnalysis() {
                var currentTickTime = Bot.getLastTick(true);
                while (currentTickTime === 'MarketIsClosed') { sleep(5); currentTickTime = Bot.getLastTick(true); }
                currentTickTime = currentTickTime.epoch;
                if (currentTickTime === BinaryBotPrivateLastTickTime) { return; }
                BinaryBotPrivateLastTickTime = currentTickTime;
                for (var i = 0; i < BinaryBotPrivateTickAnalysisList.length; i++) { BinaryBotPrivateRun(BinaryBotPrivateTickAnalysisList[i]); }
            }
            var BinaryBotPrivateLimitations = ${JSON.stringify(limitations)};
            ${window.Blockly.JavaScript.javascriptGenerator.workspaceToCode(this.workspace)}
            BinaryBotPrivateRun(BinaryBotPrivateInit);
            while (true) {
                BinaryBotPrivateTickAnalysis();
                BinaryBotPrivateRun(BinaryBotPrivateStart);
                if (!BinaryBotPrivateHasCalledTradeOptions) { sleep(1); continue; }
                while (watch('before')) { BinaryBotPrivateTickAnalysis(); BinaryBotPrivateRun(BinaryBotPrivateBeforePurchase); }
                while (watch('during')) { BinaryBotPrivateTickAnalysis(); BinaryBotPrivateRun(BinaryBotPrivateDuringPurchase); }
                BinaryBotPrivateTickAnalysis();
                if (!BinaryBotPrivateRun(BinaryBotPrivateAfterPurchase)) { break; }
            }
            `;
  }

  unselectBlocks() {
    if (window.Blockly.getSelected()) {
      window.Blockly.getSelected().unselect();
    }
    return true;
  }

  disableStrayBlocks() {
    const top_blocks = this.workspace.getTopBlocks();
    top_blocks.forEach((block) => {
      if (!block.isMainBlock?.() && !block.isIndependentBlock?.()) {
        this.disableBlocksRecursively(block);
      }
    });
    return true;
  }

  disableBlocksRecursively(block) {
    block.setDisabled(true);
    if (block.nextConnection?.targetConnection) {
      this.disableBlocksRecursively(block.nextConnection.targetConnection.sourceBlock_);
    }
  }

  checkForErroredBlocks() {
    this.valueInputLimitationsListener({}, true);
    const all_blocks = this.workspace.getAllBlocks(true);
    const error_blocks = all_blocks
      .filter((block) => block.is_error_highlighted && !block.disabled)
      .filter((block, index, self) => index === self.findIndex((b) => b.error_message === block.error_message));
    if (!error_blocks.length) return true;
    this.workspace.centerOnBlock(error_blocks[0].id);
    error_blocks.forEach((block) => globalObserver.emit("ui.log.error", block.error_message));
    return false;
  }

  centerAndHighlightBlock(block_id, should_animate = false) {
    const block_to_highlight = this.workspace.getBlockById(block_id);
    if (!block_to_highlight) return;
    const all_blocks = this.workspace.getAllBlocks();
    all_blocks.forEach((block) => block.setErrorHighlighted(false));
    if (should_animate) block_to_highlight.blink();
    block_to_highlight.setErrorHighlighted(true);
    this.workspace.centerOnBlock(block_to_highlight.id);
  }

  unHighlightAllBlocks() {
    this.workspace?.getAllBlocks().forEach((block) => block.setErrorHighlighted(false));
  }

  checkForRequiredBlocks() {
    return isAllRequiredBlocksEnabled(this.workspace);
  }

  valueInputLimitationsListener(event, force_check = false) {
    if (!force_check && (!this.workspace || this.workspace.isDragging())) return;
    window.Blockly.JavaScript?.javascriptGenerator?.init?.(this.workspace);
    if (force_check) window.Blockly.hideChaff?.(false);

    const isGlobalEndDragEvent = () => event.type === window.Blockly.Events.BLOCK_DRAG && !event.isStart;
    const isGlobalDeleteEvent = () => event.type === window.Blockly.Events.BLOCK_DELETE;
    const isGlobalCreateEvent = () => event.type === window.Blockly.Events.BLOCK_CREATE;
    const isClickEvent = () =>
      event.type === window.Blockly.Events.UI && (event.element === "click" || event.element === "selected");
    const isChangeEvent = (b) => event.type === window.Blockly.Events.BLOCK_CHANGE && event.blockId === b.id;
    const isChangeInMyInputs = (b) => {
      if (event.type === window.Blockly.Events.BLOCK_CHANGE) {
        return b.inputList.some((input) => {
          if (input.connection) {
            const target_block = input.connection.targetBlock();
            return target_block && event.blockId === target_block.id;
          }
          return false;
        });
      }
      return false;
    };
    const isParentEnabledEvent = (b) => {
      if (event.type === window.Blockly.Events.BLOCK_CHANGE && event.element === "disabled") {
        let parent_block = b.getParent();
        while (parent_block !== null) {
          if (parent_block.id === event.blockId) return true;
          parent_block = parent_block.getParent();
        }
      }
      return false;
    };

    this.workspace.getAllBlocks(true).forEach((block) => {
      if (
        force_check ||
        isGlobalEndDragEvent() ||
        isGlobalDeleteEvent() ||
        isGlobalCreateEvent() ||
        isClickEvent() ||
        isChangeEvent(block) ||
        isChangeInMyInputs(block) ||
        isParentEnabledEvent(block)
      ) {
        if (block.disabled) {
          const unhighlightRecursively = (children) => {
            children.forEach((child) => {
              child.setErrorHighlighted(false);
              unhighlightRecursively(child.getChildren());
            });
          };
          unhighlightRecursively([block]);
          return;
        }
        if (!block.getRequiredValueInputs) return;
        const required_inputs_object = block.getRequiredValueInputs();
        const required_input_names = Object.keys(required_inputs_object);
        const should_highlight = required_input_names.some((input_name) => {
          const is_selected = window.Blockly.getSelected() === block;
          const is_disabled = block.disabled || block.getInheritedDisabled();
          if (is_selected || is_disabled) return false;
          if (block.isCollapsed() && block.hasErrorHighlightedDescendant()) return true;
          const input = block.getInput(input_name);
          if (!input && !block.domToMutation) {
            // eslint-disable-next-line no-console
            console.warn("Detected a non-existent required input.", { input_name, type: block.type });
          } else if (input.connection) {
            const order = window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC;
            const value = window.Blockly.JavaScript.javascriptGenerator.valueToCode(block, input_name, order);
            const inputValidatorFn = required_inputs_object[input_name];
            if (typeof inputValidatorFn === "function") return !!inputValidatorFn(value);
            return !value;
          }
          return true;
        });
        if (should_highlight) block.removeSelect();
        block.setErrorHighlighted(should_highlight, block.error_message || undefined);
        if (force_check && (block.is_error_highlighted || block.hasErrorHighlightedDescendant())) {
          let current_collapsed_block = block;
          while (current_collapsed_block) {
            current_collapsed_block.setCollapsed(false);
            current_collapsed_block = current_collapsed_block.getParent();
          }
        }
      }
    });
  }

  getStrategySounds() {
    const all_blocks = this.workspace.getAllBlocks();
    const notify_blocks = all_blocks.filter((block) => block.type === "notify");
    const strategy_sounds = [];
    notify_blocks.forEach((block) => {
      const selected_sound = block.inputList[0].fieldRow[3].value_;
      if (selected_sound !== "silent") strategy_sounds.push(selected_sound);
    });
    return strategy_sounds;
  }

  static handleDragOver(event) {
    event.stopPropagation();
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  static handleDropOver(event, handleFileChange) {
    const main_workspace_dom = document.getElementById("scratch_div");
    const local_drag_zone = document.getElementById("load-strategy__local-dropzone-area");
    if (main_workspace_dom?.contains(event.target)) {
      handleFileChange?.(event);
    } else if (local_drag_zone?.contains(event.target)) {
      handleFileChange?.(event, false);
    } else {
      event.stopPropagation();
      event.preventDefault();
      event.dataTransfer.effectAllowed = "none";
      event.dataTransfer.dropEffect = "none";
    }
  }
}

export default new DBot();
