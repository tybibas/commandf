// Minimal strategy context for the standalone Actionist deployment.
// CommandFPage reads `activeContext` to derive isActionist/contextLabel and
// passes it to DeckSurface as `clientSlug`. For Actionist the value is always
// 'actionist' — no Supabase queries, no operator machinery, no PulsePoint fallbacks.

import { createContext, useContext, ReactNode } from 'react';

type ActionistStrategyContextType = {
  activeContext: string;
};

const ACTIONIST_CONTEXT = 'actionist';

const ActionistStrategyContext = createContext<ActionistStrategyContextType>({
  activeContext: ACTIONIST_CONTEXT,
});

export function ActionistStrategyProvider({ children }: { children: ReactNode }) {
  return (
    <ActionistStrategyContext.Provider value={{ activeContext: ACTIONIST_CONTEXT }}>
      {children}
    </ActionistStrategyContext.Provider>
  );
}

export function useClientStrategy(): ActionistStrategyContextType {
  return useContext(ActionistStrategyContext);
}
