import { useEffect } from "react";

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("pointerdown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("pointerdown", handler);
    };
  }, [ref, onClose]);
}
