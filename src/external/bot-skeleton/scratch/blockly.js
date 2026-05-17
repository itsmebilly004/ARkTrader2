import * as BlocklyJavaScript from 'blockly/javascript';
import { localize } from '@deriv-com/translations';
import { setColors } from './hooks/colours.js';
import goog from './goog.js';

window.goog = goog;

const modifyBlocklyWorkSpaceContextMenu = () => {
    const exclude_item = ['blockInline'];
    exclude_item.forEach(item_id => {
        const option = window.Blockly.ContextMenuRegistry.registry.getItem(item_id);
        option.preconditionFn = () => 'hidden';
    });

    const items_to_localize = {
        undoWorkspace: localize('Undo'),
        redoWorkspace: localize('Redo'),
        cleanWorkspace: localize('Clean up Blocks'),
        collapseWorkspace: localize('Collapse Blocks'),
        expandWorkspace: localize('Expand Blocks'),
        workspaceDelete: localize('Delete All Blocks'),
    };

    Object.keys(items_to_localize).forEach(item_id => {
        const option = window.Blockly.ContextMenuRegistry.registry.getItem(item_id);
        option.displayText = localize(items_to_localize[item_id]);
    });
};

export const loadBlockly = async isDarkMode => {
    const BlocklyModule = await import('blockly');
    window.Blockly = BlocklyModule.default;
    window.Blockly.Colours = {};
    const BlocklyGenerator = new window.Blockly.Generator('code');
    const BlocklyJavaScriptGenerator = {
        ...BlocklyJavaScript,
        ...BlocklyGenerator,
    };
    window.Blockly.JavaScript = BlocklyJavaScriptGenerator;
    window.Blockly.Themes.zelos_renderer = window.Blockly.Theme.defineTheme('zelos_renderer', {
        base: window.Blockly.Themes.Zelos,
        componentStyles: {},
    });
    modifyBlocklyWorkSpaceContextMenu();
    setColors(isDarkMode);
    await import('./hooks/index.js');
    try {
        await import('./blocks');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[loadBlockly] failed while loading custom blocks barrel:', err);
        throw err;
    }
    // Post-condition: every block type referenced by main.xml must be registered.
    // If any one is missing, the import chain quietly half-succeeded.
    const required = [
        'trade_definition',
        'trade_definition_market',
        'trade_definition_tradetype',
        'trade_definition_contracttype',
        'trade_definition_candleinterval',
        'trade_definition_restartbuysell',
        'trade_definition_restartonerror',
    ];
    const missing = required.filter(t => !window.Blockly?.Blocks?.[t]);
    if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[loadBlockly] missing block registrations:', missing,
            'Registered count:', Object.keys(window.Blockly?.Blocks ?? {}).length,
            'Sample registered:', Object.keys(window.Blockly?.Blocks ?? {}).slice(0, 15));
        throw new Error(`Block registrations missing: ${missing.join(', ')}`);
    }
};
