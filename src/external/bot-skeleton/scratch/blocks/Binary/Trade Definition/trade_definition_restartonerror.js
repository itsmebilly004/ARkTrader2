import { localize } from '@deriv-com/translations';
import { excludeOptionFromContextMenu, modifyContextMenu } from '../../../utils';
import { enforceLimitations } from './trade_definition_market';

const _blockDef = {
    init() {
        this.jsonInit({
            message0: localize('Restart last trade on error (bot ignores the unsuccessful trade): {{ checkbox }}', {
                checkbox: '%1',
            }),
            args0: [
                {
                    type: 'field_checkbox',
                    name: 'RESTARTONERROR',
                    checked: true,
                    class: 'blocklyCheckbox',
                },
            ],
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            previousStatement: null,
            nextStatement: null,
        });

        this.setNextStatement(false);
        this.setMovable(false);
        this.setDeletable(false);
    },
    onchange(/* event */) {
        if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
            return;
        }

        this.enforceLimitations();
    },
    customContextMenu(menu) {
        const menu_items = [localize('Enable Block'), localize('Disable Block')];
        excludeOptionFromContextMenu(menu, menu_items);
        modifyContextMenu(menu);
    },
    enforceLimitations,
    required_inputs: ['RESTARTONERROR'],
};

if (window.Blockly?.Blocks) {
    window.Blockly.Blocks.trade_definition_restartonerror = _blockDef;
}
if (window.Blockly?.JavaScript?.javascriptGenerator?.forBlock) {
    window.Blockly.JavaScript.javascriptGenerator.forBlock.trade_definition_restartonerror = () => {};
}

export function registerBlock() {
    if (!window.Blockly?.Blocks) return;
    window.Blockly.Blocks.trade_definition_restartonerror = _blockDef;
    if (window.Blockly.JavaScript?.javascriptGenerator?.forBlock) {
        window.Blockly.JavaScript.javascriptGenerator.forBlock.trade_definition_restartonerror = () => {};
    }
}
