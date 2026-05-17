// Stub ApiHelpers. The reference wires four real services (TradingTimes,
// ContractsFor, ActiveSymbols, AccountLimits) on top of a live Deriv
// websocket. For the visual-only port we expose the same SHAPE — block
// definitions use both optional chaining (`ApiHelpers?.instance?.contracts_for`)
// AND direct method calls (`active_symbols.getMarketDropdownOptions()`) — but
// every method here returns a safe empty default. Symbol/contract dropdowns
// will be empty until a future task bridges these to arktrader's
// deriv-trading-service. Blockly dropdowns require a non-empty list shaped
// as [[displayText, value], ...].

const EMPTY_DROPDOWN = [["", ""]];

// Hardcoded Deriv market/submarket/symbol catalogue. The reference fetches
// active_symbols from the websocket; for the visual-only port we ship a
// representative slice that covers every dropdown value used by the seven
// trading-bots presets PLUS the most common Deriv synthetic indices, so the
// MARKET / SUBMARKET / SYMBOL fields display real names instead of blanks
// when a bot is loaded.
const MARKETS = [
  ["Derived", "synthetic_index"],
  ["Forex", "forex"],
  ["Stock indices", "indices"],
  ["Commodities", "commodities"],
  ["Cryptocurrencies", "cryptocurrency"],
];

const SUBMARKETS = {
  synthetic_index: [
    ["Continuous indices", "random_index"],
    ["Daily reset indices", "random_daily"],
    ["Crash/Boom", "crash_index"],
    ["Step indices", "step_index"],
    ["Range break indices", "range_break"],
    ["Jump indices", "jump_index"],
  ],
  forex: [
    ["Major pairs", "major_pairs"],
    ["Minor pairs", "minor_pairs"],
  ],
  indices: [
    ["American indices", "americas_OTC"],
    ["European indices", "europe_OTC"],
    ["Asian indices", "asia_OTC"],
  ],
  commodities: [
    ["Metals", "metals"],
    ["Energy", "energy"],
  ],
  cryptocurrency: [["Cryptocurrencies", "non_stable_coin"]],
};

const SYMBOLS = {
  random_index: [
    ["Volatility 10 Index", "R_10"],
    ["Volatility 25 Index", "R_25"],
    ["Volatility 50 Index", "R_50"],
    ["Volatility 75 Index", "R_75"],
    ["Volatility 100 Index", "R_100"],
    ["Volatility 10 (1s) Index", "1HZ10V"],
    ["Volatility 25 (1s) Index", "1HZ25V"],
    ["Volatility 50 (1s) Index", "1HZ50V"],
    ["Volatility 75 (1s) Index", "1HZ75V"],
    ["Volatility 100 (1s) Index", "1HZ100V"],
  ],
  crash_index: [
    ["Crash 300 Index", "CRASH300N"],
    ["Crash 500 Index", "CRASH500N"],
    ["Crash 1000 Index", "CRASH1000N"],
    ["Boom 300 Index", "BOOM300N"],
    ["Boom 500 Index", "BOOM500N"],
    ["Boom 1000 Index", "BOOM1000N"],
  ],
  step_index: [["Step 100 Index", "stpRNG"]],
  range_break: [
    ["Range Break 100 Index", "RDBULL"],
    ["Range Break 200 Index", "RDBEAR"],
  ],
  jump_index: [
    ["Jump 10 Index", "JD10"],
    ["Jump 25 Index", "JD25"],
    ["Jump 50 Index", "JD50"],
    ["Jump 75 Index", "JD75"],
    ["Jump 100 Index", "JD100"],
  ],
  major_pairs: [
    ["AUD/JPY", "frxAUDJPY"],
    ["AUD/USD", "frxAUDUSD"],
    ["EUR/AUD", "frxEURAUD"],
    ["EUR/GBP", "frxEURGBP"],
    ["EUR/JPY", "frxEURJPY"],
    ["EUR/USD", "frxEURUSD"],
    ["GBP/JPY", "frxGBPJPY"],
    ["GBP/USD", "frxGBPUSD"],
    ["USD/CAD", "frxUSDCAD"],
    ["USD/CHF", "frxUSDCHF"],
    ["USD/JPY", "frxUSDJPY"],
  ],
};

const TRADETYPE_CATEGORIES = [
  ["Up/Down", "callput"],
  ["Digits", "digits"],
  ["Touch/No Touch", "touchnotouch"],
  ["In/Out", "endsinout"],
  ["High/Low Ticks", "highlowticks"],
];

const TRADETYPES_BY_CATEGORY = {
  callput: [
    ["Rise/Fall", "callput"],
    ["Higher/Lower", "higherlower"],
    ["Rise Equals/Fall Equals", "risefallequals"],
  ],
  digits: [
    ["Matches/Differs", "matchesdiffers"],
    ["Even/Odd", "evenodd"],
    ["Over/Under", "overunder"],
  ],
  touchnotouch: [["Touch/No Touch", "touchnotouch"]],
  endsinout: [["Ends Between/Ends Outside", "endsinout"]],
  highlowticks: [["High Tick/Low Tick", "highlowticks"]],
};

const CANDLE_INTERVALS = [
  ["1 minute", "60"],
  ["2 minutes", "120"],
  ["3 minutes", "180"],
  ["5 minutes", "300"],
  ["10 minutes", "600"],
  ["15 minutes", "900"],
  ["30 minutes", "1800"],
  ["1 hour", "3600"],
  ["2 hours", "7200"],
  ["4 hours", "14400"],
  ["8 hours", "28800"],
  ["1 day", "86400"],
];

class ContractsForStub {
  // Backwards-compat field shape: callers also destructure
  // `getContractType` and `list` off the resolved value.
  getDurations() {
    return Promise.resolve([
      ["Ticks", "t"],
      ["Seconds", "s"],
      ["Minutes", "m"],
      ["Hours", "h"],
      ["Days", "d"],
    ]);
  }
  getAllowedCategories() {
    return Promise.resolve({ list: [], categories: {}, getContractType: () => null });
  }
  getBarriers() {
    return Promise.resolve({ values: [] });
  }
  getPredictionRange() {
    return Promise.resolve(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  }
  getMultiplierRange() {
    return Promise.resolve([
      ["x10", "10"],
      ["x20", "20"],
      ["x50", "50"],
      ["x100", "100"],
    ]);
  }
  getTradeTypeCategories() {
    return Promise.resolve(TRADETYPE_CATEGORIES);
  }
  getTradeTypes(_market, _submarket, _symbol, category) {
    return Promise.resolve(TRADETYPES_BY_CATEGORY[category] ?? TRADETYPE_CATEGORIES);
  }
  getContractTypes(_symbol, _category, trade_type) {
    if (trade_type === "evenodd") {
      return Promise.resolve([
        ["Both", "both"],
        ["Even", "DIGITEVEN"],
        ["Odd", "DIGITODD"],
      ]);
    }
    if (trade_type === "overunder") {
      return Promise.resolve([
        ["Both", "both"],
        ["Over", "DIGITOVER"],
        ["Under", "DIGITUNDER"],
      ]);
    }
    if (trade_type === "matchesdiffers") {
      return Promise.resolve([
        ["Both", "both"],
        ["Matches", "DIGITMATCH"],
        ["Differs", "DIGITDIFF"],
      ]);
    }
    return Promise.resolve([["Both", "both"]]);
  }
  getCandleIntervals() {
    return Promise.resolve(CANDLE_INTERVALS);
  }
  hasGetDurations() {
    return true;
  }
  unregisterContractsForConditions() {}
  disposeCache() {}
}

class ActiveSymbolsStub {
  active_symbols = [];
  retrieveActiveSymbols() {
    return Promise.resolve([]);
  }
  getMarketDropdownOptions() {
    return MARKETS;
  }
  getSubmarketDropdownOptions(market) {
    return SUBMARKETS[market] ?? SUBMARKETS.synthetic_index;
  }
  getSymbolDropdownOptions(submarket) {
    return SYMBOLS[submarket] ?? SYMBOLS.random_index;
  }
  getSymbolsForMarket() {
    return [];
  }
  getMarketsBySubmarkets() {
    return {};
  }
  isSymbolOpen() {
    return true;
  }
  isSymbolAvailable() {
    return true;
  }
  disposeCache() {}
}

class TradingTimesStub {
  retrieveTradingTimes() {
    return Promise.resolve({});
  }
  isMarketClosed() {
    return false;
  }
  disposeCache() {}
}

class AccountLimitsStub {
  account_limits = {};
  getStakePayoutLimits() {
    return Promise.resolve({ min_stake: 0.35, max_payout: 50000 });
  }
  disposeCache() {}
}

class ApiHelpers {
  static singleton = null;

  constructor() {
    this.trading_times = new TradingTimesStub();
    this.contracts_for = new ContractsForStub();
    this.active_symbols = new ActiveSymbolsStub();
    this.account_limits = new AccountLimitsStub();
  }

  static disposeInstance() {
    ApiHelpers.singleton = null;
  }

  static setInstance() {
    if (!ApiHelpers.singleton) {
      ApiHelpers.singleton = new ApiHelpers();
    }
    return ApiHelpers.singleton;
  }

  static get instance() {
    return ApiHelpers.singleton;
  }
}

export default ApiHelpers;
