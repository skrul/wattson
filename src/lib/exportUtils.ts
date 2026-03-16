/** Render an SVG element to a canvas-drawable image. */
export function svgToImage(el: SVGElement | HTMLElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // Observable Plot wraps SVG in <figure> and may include small legend swatch
    // SVGs before the main chart SVG. The chart SVG is the one with a viewBox.
    let svgEl: SVGElement | null;
    if (el.tagName.toLowerCase() === "svg" && el.hasAttribute("viewBox")) {
      svgEl = el as SVGElement;
    } else {
      svgEl = el.querySelector("svg[viewBox]") as SVGElement | null;
    }
    if (!svgEl) {
      reject(new Error("No chart SVG element found"));
      return;
    }

    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG as image"));
    };
    img.src = url;
  });
}
