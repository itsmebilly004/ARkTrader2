import { localize } from '@deriv-com/translations';
import { excludeOptionFromContextMenu, modifyContextMenu } from '../../../utils';
import { enforceLimitations } from './trade_definition_market';

const _blockDef = {
    init() {
        this.jsonInit({
            message0: localize('Restart buy/sell on error (disable for better performance): {{ checkbox }}', {
                checkbox: '%1',
            }),
            args0: [
                {
                    type: 'field_checkbox',
                    name: 'TIME_MACHINE_ENABLED',
                    checked: false,
                    class: 'blocklyCheckbox',
                },
            ],
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            previousStatement: null,
            nextStatement: null,
        });

        this.setMovable(false);
        this.setDeletable(false);
        this.setOnChange(() => {
            const next_block = this?.getNextBlock();
            if (next_block?.type !== 'trade_definition_restartonerror') {
                next_block?.unplug(true);
            }
        });
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
    required_inputs: ['TIME_MACHINE_ENABLED'],
};

if (window.Blockly?.Blocks) {
    window.Blockly.Blocks.trade_definition_restartbuysell = _blockDef;
}
if (window.Blockly?.JavaScript?.javascriptGenerator?.forBlock) {
    window.Blockly.JavaScript.javascriptGenerator.forBlock.trade_definition_restartbuysell = () => {};
}

export function registerBlock() {
    if (!window.Blockly?.Blocks) return;
    window.Blockly.Blocks.trade_definition_restartbuysell = _blockDef;
    if (window.Blockly.JavaScript?.javascriptGenerator?.forBlock) {
        window.Blockly.JavaScript.javascriptGenerator.forBlock.trade_definition_restartbuysell = () => {};
    }
}
