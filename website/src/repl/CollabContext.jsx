import { createContext, useContext } from 'react';
import { useCollabSession } from './useCollabSession';

const CollabContext = createContext(null);

export function CollabProvider({ children, editorRef }) {
  const collab = useCollabSession(editorRef);
  return <CollabContext.Provider value={collab}>{children}</CollabContext.Provider>;
}

export function useCollab() {
  const context = useContext(CollabContext);
  if (!context) {
    throw new Error('useCollab must be used within CollabProvider');
  }
  return context;
}
