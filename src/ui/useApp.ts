import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { AppActions, AppState } from '../state/store';

type AppStore = StoreApi<AppState & AppActions>;

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return createElement(AppContext.Provider, { value: store }, children);
}

export function useApp<T>(selector: (state: AppState & AppActions) => T): T {
  const store = useAppStore();
  return useStore(store, selector);
}

export function useAppStore(): AppStore {
  const store = useContext(AppContext);
  if (!store) throw new Error('useApp must be used within an AppProvider');
  return store;
}
