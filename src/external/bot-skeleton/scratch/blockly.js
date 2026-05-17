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
    if (!window.Blockly.Categories) {
        const { registerConstants } = await import('./hooks/constant.js');
        registerConstants();
    }
    try {
        await import('./blocks');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[loadBlockly] failed while loading custom blocks barrel:', err);
        throw err;
    }

    // Fallback: if Vite module-preload evaluated block files before window.Blockly was
    // set, the module-level assignments silently no-oped. Explicitly call each block's
    // registerBlock() so they run now that window.Blockly is fully configured.
    const required = [
        'trade_definition',
        'trade_definition_market',
        'trade_definition_tradetype',
        'trade_definition_contracttype',
        'trade_definition_candleinterval',
        'trade_definition_restartbuysell',
        'trade_definition_restartonerror',
    ];
    const preCheck = required.filter(t => !window.Blockly?.Blocks?.[t]);
    if (preCheck.length > 0) {
        try {
            const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
                import('./blocks/Binary/Trade Definition/trade_definition'),
                import('./blocks/Binary/Trade Definition/trade_definition_market'),
                import('./blocks/Binary/Trade Definition/trade_definition_tradetype'),
                import('./blocks/Binary/Trade Definition/trade_definition_contracttype'),
                import('./blocks/Binary/Trade Definition/trade_definition_candleinterval'),
                import('./blocks/Binary/Trade Definition/trade_definition_restartbuysell'),
                import('./blocks/Binary/Trade Definition/trade_definition_restartonerror'),
            ]);
            // Register in dependency order (market must precede tradetype/contracttype etc.)
            r1.registerBlock?.();
            r2.registerBlock?.();
            r3.registerBlock?.();
            r4.registerBlock?.();
            r5.registerBlock?.();
            r6.registerBlock?.();
            r7.registerBlock?.();
        } catch (regErr) {
            // eslint-disable-next-line no-console
            console.error('[loadBlockly] explicit block re-registration failed:', regErr);
        }
    }

    const missing = required.filter(t => !window.Blockly?.Blocks?.[t]);
    if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[loadBlockly] missing block registrations:', missing,
            'Registered count:', Object.keys(window.Blockly?.Blocks ?? {}).length,
            'Sample registered:', Object.keys(window.Blockly?.Blocks ?? {}).slice(0, 15));
        throw new Error(`Block registrations missing: ${missing.join(', ')}`);
    }
};
