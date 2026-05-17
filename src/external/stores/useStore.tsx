import * as React from "react";
import RootStore from "./root-store";

const StoreContext = React.createContext<RootStore | null>(null);

let singleton: RootStore | null = null;
const getStore = (): RootStore => {
  if (!singleton) singleton = new RootStore(null);
  return singleton;
};

export const StoreProvider: React.FC<{ children: React.ReactNode; dbot?: unknown }> = ({
  children,
  dbot,
}) => {
  const store = React.useMemo<RootStore>(() => {
    if (singleton) {
      if (dbot !== undefined) singleton.dbot = dbot;
      return singleton;
    }
    singleton = new RootStore(dbot ?? null);
    return singleton;
  }, [dbot]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
};

export const useStore = (): RootStore => {
  const ctx = React.useContext(StoreContext);
  if (ctx) return ctx;
  // Allow consumers to call useStore outside the provider in tests/SSR — fall back to singleton.
  return getStore();
};

export { RootStore };
