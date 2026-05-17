export function registerDerivStubBlocks(): void {
  const B = (window as any).Blockly;
  if (!B?.Blocks) return;

  const stub = (type: string) => {
    const existing = B.Blocks[type];
    // Register stub if missing OR if the existing definition has no callable init —
    // that is the exact condition Blockly's Block constructor checks before it throws
    // "Invalid block definition for type: X".
    if (existing && typeof existing === 'object' && typeof existing.init === 'function') return;
    B.Blocks[type] = {
      init(this: any) {
        this.setColour(160);
        this.setTooltip(type);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };
  };

  stub('trade');
  stub('trade_definition');
  stub('trade_definition_market');
  stub('trade_definition_tradetype');
  stub('trade_definition_contracttype');
  stub('trade_definition_tradeoptions');
  stub('before_purchase');
  stub('after_purchase');
  stub('purchase');
  stub('contract_check_result');
  stub('read_details');
  stub('read_balance');
  stub('total_profit');
  stub('last_digit');
  stub('tick_count');
  stub('trade_again');
  stub('notify');
  stub('math_number');
  stub('logic_compare');
  stub('logic_operation');
  stub('logic_ternary');
  stub('math_arithmetic');
  stub('math_single');
  stub('variables_get');
  stub('variables_set');
  stub('controls_if');
  stub('text');
  stub('text_join');
}
