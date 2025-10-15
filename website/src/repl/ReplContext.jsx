import { createContext, useContext } from 'react';

// Create a context to share the repl state across components
export const ReplContext = createContext(null);

// Provider component that wraps the app
export function ReplContextProvider({ children, value }) {
  return <ReplContext.Provider value={value}>{children}</ReplContext.Provider>;
}

// Hook to use the context
export function useRepl() {
  const context = useContext(ReplContext);
  if (!context) {
    throw new Error('useRepl must be used within ReplContextProvider');
  }
  return context;
}
