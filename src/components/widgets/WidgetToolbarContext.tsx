import { createContext, useContext, type RefObject } from "react";

export const WidgetToolbarContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useWidgetToolbarSlot() {
  return useContext(WidgetToolbarContext);
}
