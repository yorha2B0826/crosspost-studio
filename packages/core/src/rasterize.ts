import type { FormulaRasterizerResult } from "./types.js";

// Caps the rasterized canvas so an oversized SVG cannot silently produce a
// blank PNG (browsers cap canvas dimensions).
export const MAX_RASTER_SIDE = 8_192;

export function rasterScale(
  naturalWidth: number,
  naturalHeight: number,
  requestedScale: number
): number {
  const maxScale = Math.min(
    MAX_RASTER_SIDE / naturalWidth,
    MAX_RASTER_SIDE / naturalHeight
  );
  return Math.min(requestedScale, maxScale);
}

export async function browserSvgToPng(
  svgMarkup: string,
  display: boolean
): Promise<FormulaRasterizerResult> {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not decode the SVG image."));
    });
    image.src = url;
    await loaded;

    const naturalWidth = Math.max(1, image.naturalWidth || image.width);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height);
    const scale = rasterScale(naturalWidth, naturalHeight, display ? 2 : 3);
    const canvas = image.ownerDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas"
    ) as HTMLCanvasElement;
    canvas.width = Math.ceil(naturalWidth * scale);
    canvas.height = Math.ceil(naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D is unavailable.");
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, naturalWidth, naturalHeight);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("The browser could not encode the SVG image as PNG."));
        }
      }, "image/png");
    });
    return {
      bytes: new Uint8Array(await png.arrayBuffer()),
      height: naturalHeight,
      mimeType: "image/png",
      width: naturalWidth
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
