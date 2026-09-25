import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { ClockProvider } from './clock';
import { loadState, reducer, saveState, type Action, type AppState } from './app';

interface Store {
  state: AppState;
  dispatch: (action: Action) => void;
}

const StoreContext = createContext<Store | null>(null);

function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState());
  const loaded = useRef(state);

  // Save every change; the state read at startup is not a change.
  useEffect(() => {
    if (state !== loaded.current) saveState(state);
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClockProvider>
      <StoreProvider>{children}</StoreProvider>
    </ClockProvider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside Providers');
  return store;
}
