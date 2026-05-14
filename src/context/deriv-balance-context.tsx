import { createContext, useContext, type ReactNode } from "react";
import { useDerivBalance, type LiveBalance } from "@/hooks/use-deriv-balance";

const DerivBalanceContext = createContext<LiveBalance | null>(null);

export function DerivBalanceProvider({ children }: { children: ReactNode }) {
  const balance = useDerivBalance();
  return <DerivBalanceContext.Provider value={balance}>{children}</DerivBalanceContext.Provider>;
}

export function useDerivBalanceContext(): LiveBalance {
  const ctx = useContext(DerivBalanceContext);
  if (!ctx) throw new Error("useDerivBalanceContext must be used inside DerivBalanceProvider");
  return ctx;
}
