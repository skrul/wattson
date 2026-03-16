/** Render an SVG element to a canvas-drawable image. */
export function svgToImage(svgEl: SVGElement | HTMLElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
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
