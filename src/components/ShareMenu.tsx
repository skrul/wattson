import { useState, useRef, useCallback } from "react";
import { useClickOutside } from "../lib/hooks";

interface ShareMenuProps {
  onCopy: () => Promise<void>;
  onSave: () => Promise<void>;
}

export default function ShareMenu({ onCopy, onSave }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close);

  async function handleCopy() {
    setCopyStatus("copying");
    try {
      await onCopy();
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
    setOpen(false);
  }

  async function handleSave() {
    setOpen(false);
    try {
      await onSave();
    } catch (err) {
      console.error("Save failed:", err);
    }
  }

  const label = copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Failed" : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200"
        title="Share"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V13C4 13.5523 4.44772 14 5 14H11C11.5523 14 12 13.5523 12 13V8" />
          <path d="M8 2V10" />
          <path d="M5 5L8 2L11 5" />
        </svg>
      </button>
      {label && (
        <span className="ml-1.5 text-xs text-gray-500">{label}</span>
      )}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            onClick={handleCopy}
            disabled={copyStatus === "copying"}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="5" width="9" height="9" rx="1" />
              <path d="M11 5V3C11 2.44772 10.5523 2 10 2H3C2.44772 2 2 2.44772 2 3V10C2 10.5523 2.44772 11 3 11H5" />
            </svg>
            Copy to Clipboard
          </button>
          <button
            onClick={handleSave}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2V11" />
              <path d="M5 8L8 11L11 8" />
              <path d="M2 13H14" />
            </svg>
            Save as PNG
          </button>
        </div>
      )}
    </div>
  );
}
