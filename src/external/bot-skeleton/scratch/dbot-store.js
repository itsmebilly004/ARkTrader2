// Minimal DBotStore singleton. Block files reach into DBotStore.instance for
// access to flyout/toolbar/save-modal etc. The reference also wired an
// rxjs reaction to api_base.createNewInstance() on loginid change; for the
// visual-only port we drop that — arktrader owns the websocket lifecycle.

class DBotStoreInterface {
  handleFileChange = () => {
    throw new Error("handleFileChange has not been implemented.");
  };

  toggleStrategyModal = () => {
    throw new Error("toggleStrategyModal has not been implemented.");
  };
}

class DBotStore extends DBotStoreInterface {
  static singleton = null;

  constructor(store) {
    super();
    this.is_mobile = store?.is_mobile ?? false;
    this.is_dark_mode_on = store?.is_dark_mode_on ?? false;
    this.client = store?.client ?? { loginid: null };
    this.dashboard = store?.dashboard;
    this.flyout = store?.flyout;
    this.toolbar = store?.toolbar;
    this.toolbox = store?.toolbox;
    this.toolbox_xml = store?.toolbox_xml ?? null;
    this.save_modal = store?.save_modal;
    this.load_modal = store?.load_modal;
    this.setContractUpdateConfig = store?.setContractUpdateConfig ?? (() => {});
    this.toggleStrategyModal = store?.toggleStrategyModal ?? (() => {});
    this.handleFileChange = store?.handleFileChange ?? (() => {});
    this.setLoading = store?.setLoading ?? (() => {});
  }

  static setInstance(store) {
    DBotStore.singleton = new DBotStore(store);
    return DBotStore.singleton;
  }

  static get instance() {
    return DBotStore.singleton;
  }
}

export default DBotStore;
