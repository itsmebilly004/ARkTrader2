declare const dbot: {
  generateCode?: (limitations?: Record<string, unknown>) => string;
  initWorkspace: (
    publicPath: string,
    store: unknown,
    apiHelpersStore: unknown,
    isMobile: boolean,
    isDarkMode: boolean,
  ) => Promise<void>;
  runBot?: () => void;
  stopBot?: () => Promise<void>;
  terminateBot?: () => Promise<void>;
  terminateConnection?: () => void;
};

export default dbot;
