import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { loadWorkspace, reducer, saveWorkspace, type Action, type Workspace } from './workspace';

interface Store {
  ws: Workspace;
  dispatch: (action: Action) => void;
  /** ISO time of the last write to this browser's storage. */
  savedAt: string | null;
}

const StoreContext = createContext<Store | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, dispatch] = useReducer(reducer, undefined, () => loadWorkspace());
  const [savedAt, setSavedAt] = useState<string | null>(ws.savedAt);
  const loaded = useRef(ws);

  // Autosave every change to localStorage. The loaded workspace is not a change,
  // which also keeps StrictMode's repeated effects from writing on mount.
  useEffect(() => {
    if (ws === loaded.current) return;
    setSavedAt(saveWorkspace(ws).savedAt);
  }, [ws]);

  return <StoreContext.Provider value={{ ws, dispatch, savedAt }}>{children}</StoreContext.Provider>;
}

export function useWorkspace(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return store;
}
