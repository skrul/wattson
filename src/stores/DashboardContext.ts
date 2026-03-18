import { createContext, useContext } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type { DashboardState } from "./dashboardStore";

export type DashboardStore = UseBoundStore<StoreApi<DashboardState>>;

export const DashboardContext = createContext<DashboardStore | null>(null);

export function useDashboardContext(): DashboardStore {
  const store = useContext(DashboardContext);
  if (!store) throw new Error("useDashboardContext must be used within a DashboardContext.Provider");
  return store;
}
