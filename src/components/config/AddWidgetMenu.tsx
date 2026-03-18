import { useState } from "react";
import WidgetGalleryModal from "./WidgetGalleryModal";

export default function AddWidgetMenu({ primary }: { primary?: boolean }) {
  const [galleryOpen, setGalleryOpen] = useState(false);

  const buttonClass = primary
    ? "inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50";

  return (
    <>
      <button onClick={() => setGalleryOpen(true)} className={buttonClass}>
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2v12M2 8h12" />
        </svg>
        Add Widget
      </button>
      <WidgetGalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </>
  );
}
